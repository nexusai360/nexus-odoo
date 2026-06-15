// mcp/tools/fora-do-catalogo/sql-guard.ts
// Verificação estrutural de SQL por AST , defesa-em-profundidade para o Caminho 3c.
//
// Abordagem: parse via pgsql-parser (libpg-query WASM, parser do PostgreSQL real).
// NÃO usa blacklist de strings , valida a estrutura do AST diretamente.
//
// Regras (todas devem ser satisfeitas para aprovar):
//   (a) O array stmts tem comprimento 1 (sem multi-statement).
//   (b) O nó-raiz é SelectStmt (SELECT ou WITH...SELECT/CTE).
//   (c) O SelectStmt NÃO tem intoClause (rejeita SELECT INTO).
//   (d) O SelectStmt NÃO tem lockingClause (rejeita SELECT ... FOR UPDATE/FOR SHARE).
//   (e) Se há withClause (CTE), cada CTE deve ter ctequery cujo nó-raiz seja SelectStmt
//       , rejeita CTEs data-modifying (WITH ... DELETE/INSERT/UPDATE RETURNING).
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
 * Valida que `sql` é uma instrução SELECT única e sem INTO, sem FOR UPDATE/FOR SHARE,
 * e sem CTEs data-modifying.
 * Retorna `{ ok: true }` ou `{ ok: false, motivo }`.
 * Nunca lança , exceções do parser são capturadas e retornadas como `{ ok: false }`.
 *
 * Também remove ponto-e-vírgula final antes do parse para evitar que um `;`
 * solitário quebre o wrap de subquery ou seja interpretado como multi-statement.
 */
export async function validarSqlSelect(sql: string): Promise<SqlGuardResult> {
  // Normalizar: remover ponto-e-vírgula final (um `;` solitário pode causar falso
  // multi-statement no wrap `SELECT * FROM (<sql>) AS _bi_subquery LIMIT n`).
  const sqlNormalizado = sql.trimEnd().replace(/;+$/, "").trimEnd();

  let result: { stmts?: unknown[] };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result = (await parse(sqlNormalizado)) as any;
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

  const selectStmt = stmt["SelectStmt"] as Record<string, unknown>;

  // (c) sem intoClause (rejeita SELECT INTO)
  if (selectStmt["intoClause"]) {
    return {
      ok: false,
      motivo: "SELECT INTO não permitido (intoClause presente).",
    };
  }

  // (d) sem lockingClause (rejeita SELECT ... FOR UPDATE / FOR SHARE)
  // lockingClause adquire locks de linha , semântica de escrita incompatível com read-only.
  if (selectStmt["lockingClause"]) {
    return {
      ok: false,
      motivo: "SELECT ... FOR UPDATE / FOR SHARE não permitido (lockingClause presente).",
    };
  }

  // (e) CTEs data-modifying: rejeitar se withClause contiver CTEs cujo ctequery
  //     não seja SelectStmt (ex.: DELETE/INSERT/UPDATE ... RETURNING).
  //     Um WITH ... DELETE ... SELECT tem nó-raiz SelectStmt mas contém DELETE data-modifying.
  const withClause = selectStmt["withClause"] as Record<string, unknown> | undefined;
  if (withClause) {
    const ctes = (withClause["ctes"] as unknown[]) ?? [];
    for (const cteItem of ctes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cte = cteItem as any;
      // A estrutura é: { CommonTableExpr: { ctequery: { <StmtType>: ... } } }
      const cteExpr = cte["CommonTableExpr"] as Record<string, unknown> | undefined;
      if (!cteExpr) continue;
      const ctequery = cteExpr["ctequery"] as Record<string, unknown> | undefined;
      if (!ctequery) continue;
      const cteRootKey = Object.keys(ctequery)[0];
      if (cteRootKey !== "SelectStmt") {
        return {
          ok: false,
          motivo: `CTE data-modifying não permitido: CTE contém ${cteRootKey}. Apenas CTEs com SELECT são aceitos.`,
        };
      }
    }
  }

  return { ok: true };
}

/**
 * Retorna o SQL normalizado (sem ponto-e-vírgula final) para uso seguro no wrap de subquery.
 * Usar junto com `validarSqlSelect` , chamar após a validação ser aprovada.
 *
 * Para queries CTE (WITH ...), o wrap `SELECT * FROM (...) AS _bi_subquery` não funciona em
 * PostgreSQL (CTEs no topo não podem ser subquery aninhada). Nesses casos, o SQL deve ser
 * executado diretamente sem wrap , o cap é aplicado via LIMIT inline no próprio SQL ou via
 * leitura das primeiras N linhas do result. O handler de bi-consulta-avancada usa esta função
 * para detectar o caso CTE e ajustar a estratégia de cap.
 */
export function normalizarSql(sql: string): { sql: string; temCte: boolean } {
  const sqlNormalizado = sql.trimEnd().replace(/;+$/, "").trimEnd();
  // Detecção heurística de CTE: começa com WITH (case-insensitive) seguido de espaço/newline.
  // Suficiente para o propósito , o guard AST já validou a estrutura real.
  const temCte = /^\s*with\s/i.test(sqlNormalizado);
  return { sql: sqlNormalizado, temCte };
}
