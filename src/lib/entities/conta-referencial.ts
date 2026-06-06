import type { PrismaClient } from "../../generated/prisma/client";
import type { Resolucao, Resolver, ResolverOpcoes } from "./types";
import { classificarRef } from "./_classificar-ref";
import { rankearPorNome, type OpcoesRanking } from "./_ranking";

/**
 * Entidade Conta Referencial SPED (plano referencial da Receita, model
 * `FatoContabilContaReferencial`, ~2.216 linhas; `codigo` JA indexado
 * `@@index([codigo])`). Diferente da conta contabil da empresa: aqui o codigo
 * tem a hierarquia do referencial SPED (ex.: "1.01.01.01"). Candidata expoe
 * `nomeCompleto` (caminho hierarquico completo) alem de `nome`.
 */
export interface ContaReferencial {
  odooId: number;
  codigo: string;
  nome: string | null;
  nomeCompleto: string | null;
}

/** Defaults conservadores do resolvedor (spec 4.6). */
export const DEFAULTS_CONTA_REF = { topN: 3, limiarFuzzy: 0.75, margemFolga: 0.1 } as const;

/** Colunas minimas para montar a candidata (nunca `findMany` cego de tudo). */
const SELECT_CONTA_REF = {
  odooId: true,
  codigo: true,
  nome: true,
  nomeCompleto: true,
} as const;

/**
 * Resolve uma referencia textual para uma Conta Referencial SPED.
 *
 * Ordem dos ramos (spec 3.3/5): classificarRef -> id -> codigo (exato com
 * pontos via indice; ou forma sem pontos por prefixo + igualdade de digits em
 * JS, anti-falso-positivo) -> nome fuzzy (`nomeCompleto` + `nome`).
 *
 * Invariante "nunca entidade falsa": codigo so casa por IGUALDADE de digits
 * (jamais `contains`); na duvida de nome, `ambigua` (top-N) ou `nenhuma`.
 */
export const resolverContaReferencial: Resolver<ContaReferencial> = async (
  prisma: PrismaClient,
  ref: string,
  opcoes?: ResolverOpcoes,
): Promise<Resolucao<ContaReferencial>> => {
  const r = ref.trim();
  if (r === "") return { status: "nenhuma" };

  const tipo = classificarRef(r);

  // Ramo id: o referencial vive no namespace global de odoo_id (model proprio).
  // Termo de 1..9 digitos cai aqui (classificarRef). Tenta id primeiro; se nao
  // achar, NAO encerra: um numero curto sem pontos tambem pode ser um codigo
  // hierarquico digitado sem os pontos (ex.: "10101" => "1.01.01"), entao cai
  // para o ramo de codigo sem pontos abaixo.
  if (tipo === "id") {
    const odooId = Number(r);
    const achado = await prisma.fatoContabilContaReferencial.findUnique({
      where: { odooId },
      select: SELECT_CONTA_REF,
    });
    if (achado) return { status: "unica", entidade: achado, score: 1 };
  }

  // Ramo codigo com pontos (forma canonica do referencial): match exato pelo
  // indice `@@index([codigo])`. So tenta quando ha ponto no termo.
  if (r.includes(".")) {
    const exatos = await prisma.fatoContabilContaReferencial.findMany({
      where: { codigo: r },
      select: SELECT_CONTA_REF,
    });
    if (exatos.length === 1) return { status: "unica", entidade: exatos[0], score: 1 };
    if (exatos.length > 1) {
      return {
        status: "ambigua",
        candidatas: exatos.map((e) => ({ entidade: e, score: 1 })),
        criterio: "codigo",
      };
    }
    return { status: "nenhuma" };
  }

  // Ramo codigo sem pontos (so digitos): o usuario digitou "10101" querendo
  // "1.01.01". Carrega candidatos por prefixo do primeiro digito (reduz a
  // janela usando o indice) e compara `codigo.replace(/\./g,"")` por IGUALDADE
  // de digits em JS. Igualdade, nunca `contains` (defesa anti-falso-positivo,
  // mesma logica da B20/conta-contabil).
  if (/^\d+$/.test(r) && tipo !== "documento" && tipo !== "chave_nfe") {
    const prefixo = r[0];
    const candidatos = await prisma.fatoContabilContaReferencial.findMany({
      where: { codigo: { startsWith: prefixo } },
      select: SELECT_CONTA_REF,
    });
    const casados = candidatos.filter((c) => c.codigo.replace(/\./g, "") === r);
    if (casados.length === 1) return { status: "unica", entidade: casados[0], score: 1 };
    if (casados.length > 1) {
      return {
        status: "ambigua",
        candidatas: casados.map((e) => ({ entidade: e, score: 1 })),
        criterio: "codigo",
      };
    }
    return { status: "nenhuma" };
  }

  // Ramo nome fuzzy: filtra no banco por `contains` (nomeCompleto OU nome) e
  // rankeia por scoreFuzzy contra o melhor dos dois textos. Filtra no `where`,
  // nunca `findMany` cego (spec 3.4).
  const rankOpts: OpcoesRanking = {
    topN: opcoes?.topN ?? DEFAULTS_CONTA_REF.topN,
    limiarFuzzy: opcoes?.limiarFuzzy ?? DEFAULTS_CONTA_REF.limiarFuzzy,
    margemFolga: opcoes?.margemFolga ?? DEFAULTS_CONTA_REF.margemFolga,
  };

  const candidatos = await prisma.fatoContabilContaReferencial.findMany({
    where: {
      OR: [
        { nomeCompleto: { contains: r, mode: "insensitive" } },
        { nome: { contains: r, mode: "insensitive" } },
      ],
    },
    select: SELECT_CONTA_REF,
    take: 50,
  });

  return rankearPorNome(
    candidatos,
    r,
    (c) => c.nomeCompleto ?? c.nome ?? "",
    rankOpts,
    "nome",
  );
};
