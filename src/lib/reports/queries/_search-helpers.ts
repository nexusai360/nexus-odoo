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
 * Busca canonical em `fato_produto` (catalogo completo, ~3787 produtos).
 * Camada 0: codigo exato (regex `^\d{3,}$|^[A-Z0-9]{8,}$`).
 * Camada 1: AND tokenizado em nome com unaccent.
 * Camada 2: trgm similarity em nome com unaccent.
 * Filtros default: ativo=true, controla_estoque=true (override em options).
 */
export async function searchProductByNameWithMetaCanonical(
  prisma: PrismaClient,
  termo: string,
  options?: {
    incluirInativos?: boolean;
    incluirSemControleEstoque?: boolean;
  },
): Promise<{
  ids: number[];
  totalMatches: number;
  layer: "codigo" | "exact" | "fuzzy" | "none";
}> {
  const t = termo.trim();
  if (!t) return { ids: [], totalMatches: 0, layer: "none" };

  const inc_inativos = options?.incluirInativos === true;
  // NOTA: Matrix Fitness Group nao usa o flag `controla_estoque` no Odoo
  // (verificacao 25/05: todos os 3787 produtos tem controla_estoque=false).
  // Por isso o default eh NAO filtrar por esse campo. Pode ser ativado via
  // opcao explicita quando alguma rota precisar. Documentado.
  const filtra_ce = options?.incluirSemControleEstoque === false;
  const ativoClause = inc_inativos ? "" : ` AND "ativo"=true`;
  const ceClause = filtra_ce ? ` AND "controla_estoque"=true` : "";

  // Camada 0: codigo exato.
  if (/^\d{3,}$|^[A-Z0-9]{8,}$/.test(t)) {
    const codeRows = await prisma.$queryRawUnsafe<{ id: number }[]>(
      `SELECT "odoo_id" AS id FROM "fato_produto"
       WHERE ("codigo"=$1 OR "codigo_unico"=$1 OR "codigo_barras"=$1)${ativoClause}${ceClause}
       LIMIT 50`,
      t.toUpperCase(),
    );
    if (codeRows.length > 0) {
      return {
        ids: codeRows.map((r) => Number(r.id)),
        totalMatches: codeRows.length,
        layer: "codigo",
      };
    }
  }

  // Camada 1: AND tokens com unaccent.
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { ids: [], totalMatches: 0, layer: "none" };

  const tokenClauses = tokens
    .map(
      (_, i) =>
        `lower(public.f_unaccent_immutable("nome")) LIKE '%' || lower(public.f_unaccent_immutable($${i + 1})) || '%'`,
    )
    .join(" AND ");
  const baseWhere = `"odoo_id" IS NOT NULL${ativoClause}${ceClause} AND ${tokenClauses}`;

  const exactRows = await prisma.$queryRawUnsafe<{ id: number }[]>(
    `SELECT DISTINCT "odoo_id" AS id FROM "fato_produto" WHERE ${baseWhere} LIMIT 50`,
    ...tokens,
  );
  if (exactRows.length > 0) {
    const totalRow = await prisma.$queryRawUnsafe<{ total: number | bigint }[]>(
      `SELECT COUNT(DISTINCT "odoo_id")::int AS total FROM "fato_produto" WHERE ${baseWhere}`,
      ...tokens,
    );
    const total =
      totalRow[0] && totalRow[0].total != null
        ? Number(totalRow[0].total)
        : exactRows.length;
    return {
      ids: exactRows.map((r) => Number(r.id)),
      totalMatches: total,
      layer: "exact",
    };
  }

  // Camada 2: trgm.
  const len = t.length;
  const threshold = len < 4 ? 0.5 : len > 12 ? 0.2 : 0.3;
  const fuzzyRows = await prisma.$queryRawUnsafe<{ id: number; score: number }[]>(
    `SELECT DISTINCT "odoo_id" AS id,
       similarity(lower(public.f_unaccent_immutable("nome")), lower(public.f_unaccent_immutable($1))) AS score
     FROM "fato_produto"
     WHERE "odoo_id" IS NOT NULL${ativoClause}${ceClause}
       AND similarity(lower(public.f_unaccent_immutable("nome")), lower(public.f_unaccent_immutable($1))) >= ${threshold}
     ORDER BY score DESC LIMIT 50`,
    t,
  );
  if (fuzzyRows.length > 0) {
    return {
      ids: fuzzyRows.map((r) => Number(r.id)),
      totalMatches: fuzzyRows.length,
      layer: "fuzzy",
    };
  }
  return { ids: [], totalMatches: 0, layer: "none" };
}

/**
 * Versao com metadados (LEGADO: usa fato_estoque_saldo, so cobre produtos
 * com saldo). Mantida por compat. Para catalogo completo use
 * `searchProductByNameWithMetaCanonical` acima.
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
