// Resolvedor de entidade "parceiro" (Fase 2 do Nex, Bloco C-bis do plano).
// Fonte = FatoParceiro. Depende de documentoDigits (coluna indexada criada no Bloco C).
// Ordem dos ramos (spec 3.4): id -> documento (CNPJ/CPF normalizado, 3 formatos) -> nome fuzzy.
// Nunca devolve entidade falsa: na duvida "ambigua" (top-N) ou "nenhuma".
// Sempre filtra no banco (where), nunca findMany cego.

import type { PrismaClient } from "../../generated/prisma/client";
import type { Resolucao, ResolverOpcoes } from "./types";
import { classificarRef } from "./_classificar-ref";
import { classificarDocumento, soDigitos } from "./_documento";
import { rankearPorNome, type OpcoesRanking } from "./_ranking";

/** Defaults conservadores do resolvedor de parceiro. */
export const DEFAULTS_PARCEIRO = { topN: 3, limiarFuzzy: 0.75, margemFolga: 0.1 } as const;

/** Entidade canonica de parceiro exposta nas candidatas (shape estavel para a Fase 3). */
export interface ParceiroEntidade {
  odooId: number;
  nome: string | null;
  nomeCompleto: string | null;
  documento: string | null;
  ehCliente: boolean;
  ehFornecedor: boolean;
  uf: string | null;
  cidade: string | null;
  // dataCriacao ajuda o desempate de homonimos (parceiro mais antigo costuma ser o "real").
  dataCriacao: Date | null;
}

// Colunas minimas que todo ramo seleciona (evita findMany/findUnique cego).
const SELECT = {
  odooId: true,
  nome: true,
  nomeCompleto: true,
  documento: true,
  ehCliente: true,
  ehFornecedor: true,
  uf: true,
  cidade: true,
  dataCriacao: true,
} as const;

type Row = {
  odooId: number;
  nome: string | null;
  nomeCompleto: string | null;
  documento: string | null;
  ehCliente: boolean;
  ehFornecedor: boolean;
  uf: string | null;
  cidade: string | null;
  dataCriacao: Date | null;
};

function proj(r: Row): ParceiroEntidade {
  return {
    odooId: r.odooId,
    nome: r.nome,
    nomeCompleto: r.nomeCompleto,
    documento: r.documento,
    ehCliente: r.ehCliente,
    ehFornecedor: r.ehFornecedor,
    uf: r.uf,
    cidade: r.cidade,
    dataCriacao: r.dataCriacao,
  };
}

/**
 * Resolve uma referencia textual (id, CNPJ/CPF ou nome) para um parceiro do cadastro.
 * Documento e buscado por documentoDigits (indexado): os 3 formatos
 * "BR-07.390.039/0001-01", "07.390.039/0001-01" e "07390039000101" normalizam para o
 * mesmo digits, logo casam o mesmo parceiro (CS5). Mesmo documento em 2 cadastros => ambigua.
 */
export async function resolverParceiro(
  prisma: PrismaClient,
  ref: string,
  opcoes?: ResolverOpcoes,
): Promise<Resolucao<ParceiroEntidade>> {
  const r = ref.trim();
  const filtrosIn = (opcoes?.filtros ?? {}) as {
    ehCliente?: boolean;
    ehFornecedor?: boolean;
    ehEmpresa?: boolean;
  };
  const filtrosWhere: { ehCliente?: boolean; ehFornecedor?: boolean; ehEmpresa?: boolean } = {};
  if (typeof filtrosIn.ehCliente === "boolean") filtrosWhere.ehCliente = filtrosIn.ehCliente;
  if (typeof filtrosIn.ehFornecedor === "boolean") filtrosWhere.ehFornecedor = filtrosIn.ehFornecedor;
  if (typeof filtrosIn.ehEmpresa === "boolean") filtrosWhere.ehEmpresa = filtrosIn.ehEmpresa;

  // Ramo id (odooId Int, ate 9 digitos). classificarRef distingue id de documento.
  if (classificarRef(r) === "id") {
    const found = (await prisma.fatoParceiro.findUnique({
      where: { odooId: Number(r) },
      select: SELECT,
    })) as Row | null;
    if (found) return { status: "unica", entidade: proj(found), score: 1 };
    return { status: "nenhuma" };
  }

  // Ramo documento (CNPJ/CPF). classificarDocumento tolera mascara e prefixo "BR-"
  // (que classificarRef rejeita por conter letras). Busca por documentoDigits indexado.
  if (classificarDocumento(r) !== null) {
    const digits = soDigitos(r);
    const rows = (await prisma.fatoParceiro.findMany({
      where: { documentoDigits: digits, ...filtrosWhere },
      select: SELECT,
    })) as Row[];
    if (rows.length === 1) return { status: "unica", entidade: proj(rows[0]), score: 1 };
    if (rows.length > 1) {
      return {
        status: "ambigua",
        candidatas: rows.map((row) => ({ entidade: proj(row), score: 1 })),
        criterio: "documento",
      };
    }
    return { status: "nenhuma" };
  }

  // Ramo nome fuzzy (texto). Pre-filtra por `contains` em nome OU nomeCompleto
  // (nunca findMany cego), depois rankeia com scoreFuzzy contra o nome.
  const candidatos = (await prisma.fatoParceiro.findMany({
    where: {
      OR: [
        { nome: { contains: r, mode: "insensitive" } },
        { nomeCompleto: { contains: r, mode: "insensitive" } },
      ],
      ...filtrosWhere,
    },
    select: SELECT,
  })) as Row[];

  const ranking: OpcoesRanking = {
    topN: opcoes?.topN ?? DEFAULTS_PARCEIRO.topN,
    limiarFuzzy: opcoes?.limiarFuzzy ?? DEFAULTS_PARCEIRO.limiarFuzzy,
    margemFolga: opcoes?.margemFolga ?? DEFAULTS_PARCEIRO.margemFolga,
  };

  const entidades = candidatos.map(proj);
  return rankearPorNome<ParceiroEntidade>(
    entidades,
    r,
    (c) => c.nome ?? "",
    ranking,
    "nome",
  );
}
