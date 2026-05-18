// mcp/tools/caminho3/sql-guard.test.ts
// Testa a verificação estrutural de SQL por AST via pgsql-parser.
// Requer loadModule() antes dos testes (inicializa WASM do libpg-query).
import { loadModule } from "pgsql-parser";
import { validarSqlSelect } from "./sql-guard.js";

beforeAll(async () => {
  await loadModule();
});

describe("validarSqlSelect — aprovados", () => {
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
});

describe("validarSqlSelect — rejeitados", () => {
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
});
