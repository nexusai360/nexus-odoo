import type { PrismaClient } from "../../generated/prisma/client";
import type { Resolver, Resolucao } from "./types";
import { rankearPorNome } from "./_ranking";

/**
 * Natureza de operacao (fonte: `fato_referencia` com `tabela='natureza_operacao'`).
 *
 * NAMESPACE PROPRIO (spec 4.8 armadilha a): o `id` autoincrement de `fato_referencia`
 * NAO e um odooId e NAO identifica a natureza. A chave de negocio e o `codigo` STRING,
 * com zeros a esquerda ("001"). Por isso:
 *  - o ramo "id global" de outros resolvedores NAO se aplica aqui;
 *  - a candidata NAO carrega `odooId`, so `{ codigo, descricao }`;
 *  - "001" e "1" nunca viram `Number()`: a busca casa o `codigo` como string crua,
 *    de modo que "1" jamais casa o odoo_id=1 de outra tabela.
 */
export interface NaturezaOperacao {
  codigo: string;
  descricao: string | null;
}

/** Defaults conservadores do resolvedor de natureza (spec / plano B31-B34). */
export const DEFAULTS_NATUREZA = { topN: 3, limiarFuzzy: 0.75, margemFolga: 0.1 } as const;

const TABELA = "natureza_operacao";

type LinhaReferencia = { codigo: string; descricao: string | null };

function proj(l: LinhaReferencia): NaturezaOperacao {
  return { codigo: l.codigo, descricao: l.descricao };
}

/**
 * Resolve uma referencia textual para uma natureza de operacao.
 *
 * Estrategia (sem `classificarRef` global, porque o namespace e proprio):
 *  1. Ramo codigo (namespace): `where { tabela, codigo: ref.trim() }` , igualdade exata
 *     de string, leading zeros preservados. Match => `unica`.
 *  2. Ramo descricao (fuzzy): pre-filtra por `descricao contains` (insensitive) e rankeia
 *     com `rankearPorNome` (limiar/folga). 1 forte com folga => `unica`; varios proximos =>
 *     `ambigua` criterio "nome"; nada acima do limiar => `nenhuma`.
 *
 * SEMPRE filtra no banco (where com `tabela`), nunca `findMany` cego.
 * O `where` minimo replica a fonte unica `queryReferenciaBuscar`
 * (src/lib/reports/queries/referencia.ts), aqui restrita a `tabela='natureza_operacao'`.
 */
export const resolverNaturezaOperacao: Resolver<NaturezaOperacao> = async (
  prisma: PrismaClient,
  ref: string,
  opcoes,
): Promise<Resolucao<NaturezaOperacao>> => {
  const r = ref.trim();
  const opts = {
    topN: opcoes?.topN ?? DEFAULTS_NATUREZA.topN,
    limiarFuzzy: opcoes?.limiarFuzzy ?? DEFAULTS_NATUREZA.limiarFuzzy,
    margemFolga: opcoes?.margemFolga ?? DEFAULTS_NATUREZA.margemFolga,
  };

  if (r.length === 0) return { status: "nenhuma" };

  // Ramo codigo (namespace): igualdade exata de string. "001" nunca vira Number().
  const porCodigo = await prisma.fatoReferencia.findMany({
    where: { tabela: TABELA, codigo: r },
    select: { codigo: true, descricao: true },
  });
  if (porCodigo.length > 0) {
    return { status: "unica", entidade: proj(porCodigo[0]), score: 1 };
  }

  // Ramo descricao (fuzzy): pre-filtro por contains insensitive, depois ranking.
  const porDescricao = await prisma.fatoReferencia.findMany({
    where: { tabela: TABELA, descricao: { contains: r, mode: "insensitive" } },
    select: { codigo: true, descricao: true },
  });
  const ranqueado = rankearPorNome<LinhaReferencia>(
    porDescricao,
    r,
    (c) => c.descricao ?? "",
    opts,
    "nome",
  );

  if (ranqueado.status === "nenhuma") return { status: "nenhuma" };
  if (ranqueado.status === "unica") {
    return { status: "unica", entidade: proj(ranqueado.entidade), score: ranqueado.score };
  }
  return {
    status: "ambigua",
    criterio: "nome",
    candidatas: ranqueado.candidatas.map((c) => ({ entidade: proj(c.entidade), score: c.score })),
  };
};
