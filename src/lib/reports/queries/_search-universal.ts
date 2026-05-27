// Camada universal de busca tolerante a acento/grafia, reuso em qualquer
// tabela cujo schema esteja na whitelist tipada abaixo. Padroniza:
//
//   1) Tokenizacao AND  : "espiral mola aco" => filtros AND por token.
//   2) Camada 1 exata   : lower(f_unaccent_immutable(col)) LIKE '%tok%' AND ...
//   3) Camada 2 trgm    : similarity(...) >= threshold (dinamico por len).
//   4) Telemetria leve  : retorna `layer` (exact|fuzzy|none) e totalMatches.
//
// O caller passa um literal de SearchTarget (union discriminada); TypeScript
// impede combinacao de tabela/coluna invalida. Tenant scoping nao se aplica
// neste dominio (operacao monotenant na Matrix Fitness Group); se um dia
// virar multi, o caller injeta tenantSql/tenantParams. Sem injection: tudo
// que sai daqui em SQL e literal de whitelist; valores vao parametrizados.

// NOTA: nao usa "server-only" porque o servidor MCP (Node puro, sem Next)
// importa este modulo via tools como estoque_saldo_produto. O "server-only"
// e do Next e quebra o require do MCP. A protecao "so roda no server" e
// garantida pela natureza do consumo (queries Prisma + sql raw).

import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Combinacoes (tabela, coluna_de_busca, coluna_pk) permitidas para a busca
 * universal. Expansao requer alteracao explicita aqui + migration com indice
 * funcional unaccent+trgm na coluna alvo.
 */
export type SearchTarget =
  | {
      table: "fato_estoque_saldo";
      pkColumn: "produto_id";
      nameColumn: "produto_nome";
    }
  | { table: "fato_parceiro"; pkColumn: "odoo_id"; nameColumn: "nome" }
  | {
      table: "fato_parceiro";
      pkColumn: "odoo_id";
      nameColumn: "nome_completo";
    }
  | {
      table: "fato_pedido";
      pkColumn: "odoo_id";
      nameColumn: "participante_nome";
    };

/** Limite duro de candidatos retornados em uma busca. */
const HARD_LIMIT = 50;

export interface FuzzySearchResult {
  /** IDs encontrados (numero ou string conforme o pk da tabela). */
  ids: Array<string | number>;
  /** Total real de matches (sem cap), util para sinalizar ambiguidade. */
  totalMatches: number;
  /** Qual camada de busca produziu o resultado. */
  layer: "exact" | "fuzzy" | "none";
}

/**
 * Calcula o threshold de similaridade pg_trgm. Termos curtos exigem casamento
 * mais estrito (poucos caracteres ja casam ruido); termos longos podem ceder
 * mais (typo em palavra grande nao deve descartar resultado).
 */
function dynamicThreshold(term: string): number {
  const len = term.trim().length;
  if (len < 4) return 0.5;
  if (len > 12) return 0.2;
  return 0.3;
}

/**
 * Tokeniza o termo em palavras (split por whitespace) e prepara para uso em
 * filtros AND no SQL. Mantem so tokens nao vazios.
 */
function tokenize(term: string): string[] {
  return term
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Executa a busca universal. Caller passa o SearchTarget como literal
 * (TypeScript valida); o termo e tokenizado e procurado em duas camadas.
 *
 * Implementacao: queryRawUnsafe com whitelist (literal seguro) + parametros
 * para os valores do usuario (parametrizacao previne SQL injection).
 */
export async function fuzzySearch(
  prisma: PrismaClient,
  target: SearchTarget,
  term: string,
  options?: { limit?: number },
): Promise<FuzzySearchResult> {
  const tokens = tokenize(term);
  if (tokens.length === 0) {
    return { ids: [], totalMatches: 0, layer: "none" };
  }

  const limit = Math.min(options?.limit ?? HARD_LIMIT, HARD_LIMIT);

  // Camada 1: AND tokenizado com unaccent. Cada token vira um placeholder.
  // Building dynamic WHERE: where_clauses join ' AND '.
  const tokenClauses = tokens
    .map(
      (_, i) =>
        `lower(public.f_unaccent_immutable("${target.nameColumn}")) LIKE '%' || lower(public.f_unaccent_immutable($${i + 1})) || '%'`,
    )
    .join(" AND ");

  const exactSql = `
    SELECT DISTINCT "${target.pkColumn}" AS id
    FROM "${target.table}"
    WHERE "${target.pkColumn}" IS NOT NULL
      AND ${tokenClauses}
    LIMIT ${limit}
  `;
  const exactCountSql = `
    SELECT COUNT(DISTINCT "${target.pkColumn}")::int AS total
    FROM "${target.table}"
    WHERE "${target.pkColumn}" IS NOT NULL
      AND ${tokenClauses}
  `;

  const exactRows = await prisma.$queryRawUnsafe<{ id: number | string }[]>(
    exactSql,
    ...tokens,
  );
  if (exactRows.length > 0) {
    const totalRow = await prisma.$queryRawUnsafe<{ total: number | bigint }[]>(
      exactCountSql,
      ...tokens,
    );
    const total =
      totalRow[0] && totalRow[0].total != null
        ? Number(totalRow[0].total)
        : exactRows.length;
    return {
      ids: exactRows.map((r) => r.id),
      totalMatches: total,
      layer: "exact",
    };
  }

  // Camada 2: similaridade trgm sobre o termo inteiro (ordem das palavras
  // nao importa para pg_trgm). Threshold dinamico por tamanho.
  const threshold = dynamicThreshold(term);
  const fuzzySql = `
    SELECT DISTINCT "${target.pkColumn}" AS id,
           similarity(
             lower(public.f_unaccent_immutable("${target.nameColumn}")),
             lower(public.f_unaccent_immutable($1))
           ) AS score
    FROM "${target.table}"
    WHERE "${target.pkColumn}" IS NOT NULL
      AND similarity(
            lower(public.f_unaccent_immutable("${target.nameColumn}")),
            lower(public.f_unaccent_immutable($1))
          ) >= ${threshold}
    ORDER BY score DESC
    LIMIT ${limit}
  `;
  const fuzzyRows = await prisma.$queryRawUnsafe<
    { id: number | string; score: number }[]
  >(fuzzySql, term.trim());

  if (fuzzyRows.length === 0) {
    return { ids: [], totalMatches: 0, layer: "none" };
  }

  return {
    ids: fuzzyRows.map((r) => r.id),
    totalMatches: fuzzyRows.length,
    layer: "fuzzy",
  };
}
