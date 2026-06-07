// mcp/tools/fora-do-catalogo/sql-guard.test.ts
// Testa a verificação estrutural de SQL por AST via pgsql-parser.
// Requer loadModule() antes dos testes (inicializa WASM do libpg-query).
import { loadModule } from "pgsql-parser";
import { validarSqlSelect, normalizarSql } from "./sql-guard.js";

beforeAll(async () => {
  await loadModule();
});

describe("validarSqlSelect , aprovados", () => {
  it("SELECT simples → ok: true", async () => {
    const result = await validarSqlSelect("SELECT * FROM fato_pedido");
    expect(result.ok).toBe(true);
  });

  it("CTE WITH...SELECT → ok: true", async () => {
    const result = await validarSqlSelect(
      "WITH x AS (SELECT 1) SELECT * FROM x",
    );
    expect(result.ok).toBe(true);
  });

  it("SELECT com WHERE e ORDER BY → ok: true", async () => {
    const result = await validarSqlSelect(
      "SELECT id, valor FROM fato_pedido WHERE status = 'aprovado' ORDER BY data_criacao DESC",
    );
    expect(result.ok).toBe(true);
  });

  it("query com ponto-e-vírgula final → ok: true (normalizado)", async () => {
    const result = await validarSqlSelect("SELECT * FROM fato_pedido;");
    expect(result.ok).toBe(true);
  });
});

describe("validarSqlSelect , rejeitados", () => {
  it("DELETE → ok: false", async () => {
    const result = await validarSqlSelect("DELETE FROM fato_pedido");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(typeof result.motivo).toBe("string");
  });

  it("INSERT → ok: false", async () => {
    const result = await validarSqlSelect("INSERT INTO x VALUES(1)");
    expect(result.ok).toBe(false);
  });

  it("multi-statement → ok: false", async () => {
    const result = await validarSqlSelect(
      "SELECT 1; DROP TABLE fato_pedido",
    );
    expect(result.ok).toBe(false);
  });

  it("SELECT INTO → ok: false (SelectStmt com intoClause)", async () => {
    const result = await validarSqlSelect(
      "SELECT * INTO nova_tabela FROM fato_pedido",
    );
    expect(result.ok).toBe(false);
  });

  it("SQL inválido/não parseável → ok: false", async () => {
    const result = await validarSqlSelect("SELCT * FRM");
    expect(result.ok).toBe(false);
  });

  it("UPDATE → ok: false", async () => {
    const result = await validarSqlSelect(
      "UPDATE fato_pedido SET status = 'x' WHERE 1=1",
    );
    expect(result.ok).toBe(false);
  });

  it("DROP TABLE → ok: false", async () => {
    const result = await validarSqlSelect("DROP TABLE fato_pedido");
    expect(result.ok).toBe(false);
  });

  // I-2: SELECT ... FOR UPDATE / FOR SHARE (lockingClause)
  it("SELECT ... FOR UPDATE → ok: false (lockingClause)", async () => {
    const result = await validarSqlSelect(
      "SELECT * FROM fato_pedido FOR UPDATE",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.motivo).toMatch(/lockingClause/);
  });

  it("SELECT ... FOR SHARE → ok: false (lockingClause)", async () => {
    const result = await validarSqlSelect(
      "SELECT id FROM fato_pedido WHERE id = 1 FOR SHARE",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.motivo).toMatch(/lockingClause/);
  });

  // I-3: CTE data-modifying (WITH w AS (DELETE ... RETURNING) SELECT ...)
  it("CTE com DELETE RETURNING → ok: false (CTE data-modifying)", async () => {
    const result = await validarSqlSelect(
      "WITH w AS (DELETE FROM fato_pedido WHERE id = 1 RETURNING *) SELECT * FROM w",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.motivo).toMatch(/CTE data-modifying/);
  });

  it("CTE com INSERT RETURNING → ok: false (CTE data-modifying)", async () => {
    const result = await validarSqlSelect(
      "WITH w AS (INSERT INTO fato_pedido (id) VALUES (999) RETURNING *) SELECT * FROM w",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.motivo).toMatch(/CTE data-modifying/);
  });

  it("CTE com UPDATE RETURNING → ok: false (CTE data-modifying)", async () => {
    const result = await validarSqlSelect(
      "WITH w AS (UPDATE fato_pedido SET status = 'x' WHERE 1=0 RETURNING *) SELECT * FROM w",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.motivo).toMatch(/CTE data-modifying/);
  });
});

describe("normalizarSql", () => {
  it("remove ponto-e-vírgula final e detecta não-CTE", () => {
    const { sql, temCte } = normalizarSql("SELECT * FROM fato_pedido;");
    expect(sql).toBe("SELECT * FROM fato_pedido");
    expect(temCte).toBe(false);
  });

  it("detecta CTE (WITH)", () => {
    const { sql, temCte } = normalizarSql("WITH x AS (SELECT 1) SELECT * FROM x");
    expect(temCte).toBe(true);
    expect(sql).toBe("WITH x AS (SELECT 1) SELECT * FROM x");
  });

  it("detecta CTE case-insensitive", () => {
    const { temCte } = normalizarSql("  with x AS (SELECT 1) SELECT * FROM x");
    expect(temCte).toBe(true);
  });

  it("remove múltiplos ponto-e-vírgulas finais", () => {
    const { sql } = normalizarSql("SELECT 1;;;");
    expect(sql).toBe("SELECT 1");
  });
});
