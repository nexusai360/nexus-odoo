// mcp/tools/caminho3/sql-guard.ts
// Verificação estrutural de SQL por AST — defesa-em-profundidade para o Caminho 3c.
//
// Abordagem: parse via pgsql-parser (libpg-query WASM, parser do PostgreSQL real).
// NÃO usa blacklist de strings — valida a estrutura do AST diretamente.
//
// Regras (todas devem ser satisfeitas para aprovar):
//   (a) O array stmts tem comprimento 1 (sem multi-statement).
//   (b) O nó-raiz é SelectStmt (SELECT ou WITH...SELECT/CTE).
//   (c) O SelectStmt NÃO tem intoClause (rejeita SELECT INTO).
//
// O role nexus_mcp_bi é o controle primário de read-only; esta verificação
// AST é defesa-em-profundidade (achado N1 da SPEC v3).
//
// API de pgsql-parser documentada em mcp/SDK-NOTES.md (H.4).
import { parse } from "pgsql-parser";

export type SqlGuardResult =
  | { ok: true }
  | { ok: false; motivo: string };

/**
 * Valida que `sql` é uma instrução SELECT única e sem INTO.
 * Retorna `{ ok: true }` ou `{ ok: false, motivo }`.
 * Nunca lança — exceções do parser são capturadas e retornadas como `{ ok: false }`.
 */
export async function validarSqlSelect(sql: string): Promise<SqlGuardResult> {
  let result: { stmts?: unknown[] };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result = (await parse(sql)) as any;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, motivo: `SQL inválido ou não parseável: ${msg}` };
  }

  const stmts = result.stmts ?? [];

  // (a) instrução única
  if (stmts.length !== 1) {
    return {
      ok: false,
      motivo: `Multi-statement não permitido (${stmts.length} instruções encontradas).`,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stmt = (stmts[0] as any).stmt as Record<string, unknown>;
  const rootKey = Object.keys(stmt)[0];

  // (b) nó-raiz deve ser SelectStmt
  if (rootKey !== "SelectStmt") {
    return {
      ok: false,
      motivo: `Tipo de instrução não permitido: ${rootKey}. Apenas SELECT é aceito.`,
    };
  }

  // (c) sem intoClause (rejeita SELECT INTO)
  const selectStmt = stmt["SelectStmt"] as Record<string, unknown>;
  if (selectStmt["intoClause"]) {
    return {
      ok: false,
      motivo: "SELECT INTO não permitido (intoClause presente).",
    };
  }

  return { ok: true };
}
