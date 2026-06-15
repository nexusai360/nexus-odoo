import type { PrismaClient } from "../../generated/prisma/client";
import type { Resolucao, Resolver, ResolverOpcoes } from "./types";
import { classificarRef } from "./_classificar-ref";

/**
 * Entidade canonica de nota fiscal devolvida pelo resolvedor.
 * Shape fixado no plano B17: identidade, classificacao fiscal e dados de exibicao.
 * `situacaoNfe` vem sempre presente: cancelada e marcada, nunca escondida.
 */
export interface NotaFiscalEntidade {
  odooId: number;
  serie: string | null;
  modelo: string | null;
  chave: string | null;
  situacaoNfe: string | null;
  participanteNome: string | null;
  dataEmissao: Date | null;
  vrNf: number;
}

/**
 * Defaults conservadores do resolvedor de NF (plano: secao Nota Fiscal).
 * NF nao tem nome textual, entao limiarFuzzy/margemFolga nao sao exercidos por ramo de nome;
 * ficam declarados para uniformidade com os demais resolvedores e eventual filtragem futura.
 */
export const DEFAULTS_NOTA: Required<Pick<ResolverOpcoes, "topN" | "limiarFuzzy" | "margemFolga">> = {
  topN: 3,
  limiarFuzzy: 0.75,
  margemFolga: 0.1,
};

/** Campos do FatoNotaFiscal projetados para o shape da entidade (evita over-fetch). */
const SELECT_NOTA = {
  odooId: true,
  serie: true,
  modelo: true,
  chave: true,
  situacaoNfe: true,
  participanteNome: true,
  dataEmissao: true,
  vrNf: true,
} as const;

type LinhaNota = {
  odooId: number;
  serie: string | null;
  modelo: string | null;
  chave: string | null;
  situacaoNfe: string | null;
  participanteNome: string | null;
  dataEmissao: Date | null;
  vrNf: { toNumber: () => number } | number;
};

/** Projeta a linha bruta do cache (vrNf e Decimal do Prisma) no shape canonico. */
function proj(c: LinhaNota): NotaFiscalEntidade {
  return {
    odooId: c.odooId,
    serie: c.serie,
    modelo: c.modelo,
    chave: c.chave,
    situacaoNfe: c.situacaoNfe,
    participanteNome: c.participanteNome,
    dataEmissao: c.dataEmissao,
    vrNf: typeof c.vrNf === "number" ? c.vrNf : c.vrNf.toNumber(),
  };
}

/** Filtros aceitos no ramo lista (data + entradaSaida). Tudo opcional. */
interface FiltrosNota {
  dataDe?: Date;
  dataAte?: Date;
  entradaSaida?: string;
}

function lerFiltros(filtros: Record<string, unknown> | undefined): FiltrosNota {
  if (!filtros) return {};
  const out: FiltrosNota = {};
  if (filtros.dataDe instanceof Date) out.dataDe = filtros.dataDe;
  if (filtros.dataAte instanceof Date) out.dataAte = filtros.dataAte;
  if (typeof filtros.entradaSaida === "string") out.entradaSaida = filtros.entradaSaida;
  return out;
}

/**
 * Resolve uma referencia textual para uma nota fiscal do cache (FatoNotaFiscal).
 *
 * Estrategia (plano B15-B18, spec 4.4):
 * - Ramo id: `^\d{1,9}$` => `findUnique({ odooId })`. Achou => unica.
 * - Ramo chave: SO quando `classificarRef`=="chave_nfe" (ou seja `^\d{44}$`) =>
 *   `where: { chave }` exato (indice criado no Bloco C). 9/41/50 digitos ou com letra
 *   NAO roteiam aqui (armadilha a da spec): sem outro match => nenhuma.
 * - Ramo lista por filtros: intervalo de data + `entradaSaida` (via `opcoes.filtros`)
 *   retorna lista (ambigua) ou nenhuma; NUNCA `unica` so por data. `situacaoNfe='cancelada'`
 *   aparece marcada na candidata, nao filtrada do where.
 *
 * `numero` NUNCA e consultado (campo 100% null no cache, spec 4.4): nenhum ramo o toca.
 * Invariante: na duvida, ambigua ou nenhuma; nunca devolve nota falsa.
 */
export const resolverNotaFiscal: Resolver<NotaFiscalEntidade> = async (
  prisma: PrismaClient,
  ref: string,
  opcoes?: ResolverOpcoes,
): Promise<Resolucao<NotaFiscalEntidade>> => {
  const r = ref.trim();
  const tipo = classificarRef(r);

  // Ramo id (ate 9 digitos, dentro do Int32 do odooId).
  if (tipo === "id") {
    const found = await prisma.fatoNotaFiscal.findUnique({
      where: { odooId: Number(r) },
      select: SELECT_NOTA,
    });
    if (found) return { status: "unica", entidade: proj(found as LinhaNota), score: 1 };
    return { status: "nenhuma" };
  }

  // Ramo chave NFe (so `^\d{44}$`; nunca 9/41/50 ou com letra).
  if (tipo === "chave_nfe") {
    const found = await prisma.fatoNotaFiscal.findFirst({
      where: { chave: r },
      select: SELECT_NOTA,
    });
    if (found) return { status: "unica", entidade: proj(found as LinhaNota), score: 1 };
    return { status: "nenhuma" };
  }

  // Ramo lista por data + entradaSaida (via opcoes.filtros). Nunca `unica` so por data.
  const f = lerFiltros(opcoes?.filtros);
  const temFiltro = f.dataDe !== undefined || f.dataAte !== undefined || f.entradaSaida !== undefined;
  if (temFiltro) {
    const topN = opcoes?.topN ?? DEFAULTS_NOTA.topN;
    const dataEmissao =
      f.dataDe || f.dataAte
        ? {
            ...(f.dataDe ? { gte: f.dataDe } : {}),
            ...(f.dataAte ? { lte: f.dataAte } : {}),
          }
        : undefined;
    // Filtra no banco. `situacaoNfe` NAO entra no where: cancelada vem marcada, nao some.
    const linhas = await prisma.fatoNotaFiscal.findMany({
      where: {
        ...(dataEmissao ? { dataEmissao } : {}),
        ...(f.entradaSaida ? { entradaSaida: f.entradaSaida } : {}),
      },
      select: SELECT_NOTA,
      orderBy: { dataEmissao: "desc" },
      take: topN,
    });
    if (linhas.length === 0) return { status: "nenhuma" };
    // Lista por data/operacao e inerentemente um conjunto: sempre ambigua, nunca unica.
    return {
      status: "ambigua",
      candidatas: linhas.map((c) => ({ entidade: proj(c as LinhaNota), score: 1 })),
      criterio: "documento",
    };
  }

  // Texto livre sem filtros: NF nao tem nome textual; nada a casar.
  return { status: "nenhuma" };
};
