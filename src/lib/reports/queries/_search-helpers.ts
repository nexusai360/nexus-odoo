// Helpers de busca tolerante a acento/grafia para queries de relatorio.
//
// Wrappers finos sobre `_search-universal.fuzzySearch`. A camada universal
// faz:
//   1. Tokenizacao AND  (resolve ordem de palavras: "mola espiral aco" ==
//                        "espiral mola aco" == "aco mola espiral").
//   2. Camada exata unaccent.
//   3. Camada fuzzy pg_trgm com threshold dinamico (0.5 para termo curto,
//      0.3 padrao, 0.2 para termo longo).
//
// Indices criados em:
//   - 20260523090100_search_unaccent_trgm (fato_estoque_saldo.produto_nome)
//   - 20260524190000_search_unaccent_trgm_universal (fato_parceiro, fato_pedido)

import type { PrismaClient } from "@/generated/prisma/client";
import { fuzzySearch } from "./_search-universal";

/**
 * Wrapper legacy mantido para nao quebrar callers existentes. Novos callers
 * devem importar `fuzzySearch` direto. Retorna apenas a lista de ids; quando
 * o caller precisa do `totalMatches` (para sinalizar ambiguidade ao agente),
 * deve usar a versao detalhada abaixo.
 */
export async function searchProductIdsByName(
  prisma: PrismaClient,
  termo: string,
): Promise<number[]> {
  const r = await fuzzySearch(
    prisma,
    {
      table: "fato_estoque_saldo",
      pkColumn: "produto_id",
      nameColumn: "produto_nome",
    },
    termo,
  );
  return r.ids.map((id) => (typeof id === "number" ? id : Number(id)));
}

/**
 * Versao com metadados: alem dos ids, devolve total real de matches e a
 * camada que produziu o resultado. Usado pelo handler MCP para preencher o
 * campo opcional `ambiguidade` quando ha mais de um candidato.
 */
export async function searchProductByNameWithMeta(
  prisma: PrismaClient,
  termo: string,
): Promise<{ ids: number[]; totalMatches: number; layer: "exact" | "fuzzy" | "none" }> {
  const r = await fuzzySearch(
    prisma,
    {
      table: "fato_estoque_saldo",
      pkColumn: "produto_id",
      nameColumn: "produto_nome",
    },
    termo,
  );
  return {
    ids: r.ids.map((id) => (typeof id === "number" ? id : Number(id))),
    totalMatches: r.totalMatches,
    layer: r.layer,
  };
}

/** Busca parceiros (clientes/fornecedores/contatos) pelo nome curto. */
export async function searchPartnerIdsByName(
  prisma: PrismaClient,
  termo: string,
): Promise<number[]> {
  const r = await fuzzySearch(
    prisma,
    { table: "fato_parceiro", pkColumn: "odoo_id", nameColumn: "nome" },
    termo,
  );
  return r.ids.map((id) => (typeof id === "number" ? id : Number(id)));
}

/** Busca parceiros pelo nome completo (razao social, full name). */
export async function searchPartnerIdsByFullName(
  prisma: PrismaClient,
  termo: string,
): Promise<number[]> {
  const r = await fuzzySearch(
    prisma,
    {
      table: "fato_parceiro",
      pkColumn: "odoo_id",
      nameColumn: "nome_completo",
    },
    termo,
  );
  return r.ids.map((id) => (typeof id === "number" ? id : Number(id)));
}
