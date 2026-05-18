// mcp/tools/caminho3/bi-consulta-avancada.test.ts
// Testes da tool bi_consulta_avancada — executor SQL read-only do Caminho 3c.
//
// Nota de auditoria (achado R2-I4):
//   O audit de params é automático — o pipeline do server.ts grava o rawInput
//   ({ sql }) em McpAuditLog.params antes mesmo de chamar o handler. Nenhum
//   código de audit é necessário no handler.
//
// Nota de pgsql-parser:
//   validarSqlSelect chama parse() internamente. Os mocks abaixo substituem
//   o módulo sql-guard inteiro para evitar dependência do WASM nos testes unitários.

import { loadModule } from "pgsql-parser";
import { SqlGuardError, toOutcome } from "../../lib/failure.js";
import { visibleTools, assertToolAllowed } from "../../catalog/registry.js";
import { DomainDeniedError } from "../../lib/failure.js";
import type { UserContext } from "../../auth/user-context.js";

// ──────────────────────────────────────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────────────────────────────────────

// Mock do sql-guard: controle explícito por teste via mockValidarSqlSelect.
const mockValidarSqlSelect = jest.fn<
  Promise<{ ok: true } | { ok: false; motivo: string }>,
  [string]
>();
jest.mock("./sql-guard.js", () => ({
  validarSqlSelect: (...args: [string]) => mockValidarSqlSelect(...args),
}));

// Mock do bi-pool: controle explícito via mockGetBiPool.
const mockQuery = jest.fn();
const mockPoolInstance = { query: mockQuery };
const mockGetBiPool = jest.fn<{ query: jest.Mock } | null, []>();
jest.mock("./bi-pool.js", () => ({
  getBiPool: () => mockGetBiPool(),
}));

// Importar a tool DEPOIS dos mocks
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { biConsultaAvancada } = require("./bi-consulta-avancada") as {
  biConsultaAvancada: import("../../catalog/types.js").ToolEntry<
    { sql: string },
    {
      colunas: string[];
      linhas: Record<string, unknown>[];
      totalLinhas: number;
      truncado: boolean;
      aviso: string;
    }
  >;
};

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeUser(role: string, domains: string[] = []): UserContext {
  return {
    userId: "user-test",
    role: role as UserContext["role"],
    domains: domains as UserContext["domains"],
  };
}

const ctx = { prisma: {} as never, user: makeUser("super_admin") };

// ──────────────────────────────────────────────────────────────────────────────
// Antes de todos: inicializar WASM (necessário para imports transitivos)
// ──────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await loadModule();
});

beforeEach(() => {
  mockValidarSqlSelect.mockReset();
  mockGetBiPool.mockReset();
  mockQuery.mockReset();
});

// ──────────────────────────────────────────────────────────────────────────────
// ToolEntry — contratos estáticos
// ──────────────────────────────────────────────────────────────────────────────

describe("biConsultaAvancada — ToolEntry", () => {
  it("tem id correto", () => {
    expect(biConsultaAvancada.id).toBe("bi_consulta_avancada");
  });

  it("sempreVisivel é true", () => {
    expect(biConsultaAvancada.sempreVisivel).toBe(true);
  });

  it("gatedRoles contém apenas super_admin e admin", () => {
    expect(biConsultaAvancada.gatedRoles).toEqual(
      expect.arrayContaining(["super_admin", "admin"]),
    );
    expect(biConsultaAvancada.gatedRoles?.length).toBe(2);
  });

  it("dominio está ausente (tool de domínio-neutro)", () => {
    expect((biConsultaAvancada as unknown as Record<string, unknown>).dominio).toBeUndefined();
  });

  it("inputSchemaShape existe (R2-I5)", () => {
    expect(biConsultaAvancada.inputSchemaShape).toBeDefined();
  });

  it("inputSchema aceita { sql: string não-vazia }", () => {
    const result = biConsultaAvancada.inputSchema.safeParse({
      sql: "SELECT * FROM fato_pedido",
    });
    expect(result.success).toBe(true);
  });

  it("inputSchema rejeita input sem sql", () => {
    const result = biConsultaAvancada.inputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("inputSchema rejeita sql vazio", () => {
    const result = biConsultaAvancada.inputSchema.safeParse({ sql: "" });
    expect(result.success).toBe(false);
  });

  it("outputSchema aceita formato tabular", () => {
    const result = biConsultaAvancada.outputSchema.safeParse({
      colunas: ["id", "valor"],
      linhas: [{ id: 1, valor: 100 }],
      totalLinhas: 1,
      truncado: false,
      aviso: "consulta dinâmica não auditada como tool",
    });
    expect(result.success).toBe(true);
  });

  it("outputSchema NÃO tem variante de erro (R2-I6 — caminhos de recusa lançam)", () => {
    // outputSchema não aceita { disponivel: false } do stub anterior
    const result = biConsultaAvancada.outputSchema.safeParse({
      disponivel: false,
      mensagem: "erro",
      aviso: "x",
    });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Handler — SQL válido → output tabular
// ──────────────────────────────────────────────────────────────────────────────

describe("biConsultaAvancada — handler: SQL válido", () => {
  beforeEach(() => {
    mockValidarSqlSelect.mockResolvedValue({ ok: true });
    mockGetBiPool.mockReturnValue(mockPoolInstance as never);
    mockQuery.mockResolvedValue({
      fields: [{ name: "count" }],
      rows: [{ count: "42" }],
    });
  });

  it("retorna output tabular validado por outputSchema", async () => {
    const result = await biConsultaAvancada.handler(
      { sql: "SELECT count(*) FROM fato_pedido" },
      ctx,
    );
    expect(result.colunas).toEqual(["count"]);
    expect(result.linhas).toEqual([{ count: "42" }]);
    expect(result.totalLinhas).toBe(1);
    expect(result.truncado).toBe(false);
    expect(typeof result.aviso).toBe("string");
    expect(result.aviso.length).toBeGreaterThan(0);
  });

  it("aviso menciona 'consulta dinâmica'", async () => {
    const result = await biConsultaAvancada.handler(
      { sql: "SELECT 1" },
      ctx,
    );
    expect(result.aviso.toLowerCase()).toMatch(/dinâmica|dinamica/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Handler — SQL recusado pelo guard → SqlGuardError → outcome invalid_input
// ──────────────────────────────────────────────────────────────────────────────

describe("biConsultaAvancada — handler: SQL recusado pelo guard", () => {
  beforeEach(() => {
    mockValidarSqlSelect.mockResolvedValue({
      ok: false,
      motivo: "Tipo de instrução não permitido: DeleteStmt.",
    });
    mockGetBiPool.mockReturnValue(mockPoolInstance as never);
  });

  it("lança SqlGuardError quando guard recusa", async () => {
    await expect(
      biConsultaAvancada.handler({ sql: "DELETE FROM fato_pedido" }, ctx),
    ).rejects.toThrow(SqlGuardError);
  });

  it("toOutcome(SqlGuardError) === 'invalid_input' (P-C1)", async () => {
    let caught: unknown;
    try {
      await biConsultaAvancada.handler({ sql: "DELETE FROM fato_pedido" }, ctx);
    } catch (e) {
      caught = e;
    }
    expect(toOutcome(caught)).toBe("invalid_input");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Handler — pool null (MCP_BI_DATABASE_URL ausente) → Error → outcome error
// ──────────────────────────────────────────────────────────────────────────────

describe("biConsultaAvancada — handler: modo BI não configurado", () => {
  beforeEach(() => {
    mockValidarSqlSelect.mockResolvedValue({ ok: true });
    mockGetBiPool.mockReturnValue(null);
  });

  it("lança Error com mensagem 'modo BI não configurado'", async () => {
    await expect(
      biConsultaAvancada.handler({ sql: "SELECT 1" }, ctx),
    ).rejects.toThrow(/modo BI não configurado/i);
  });

  it("toOutcome(Error) === 'error'", async () => {
    let caught: unknown;
    try {
      await biConsultaAvancada.handler({ sql: "SELECT 1" }, ctx);
    } catch (e) {
      caught = e;
    }
    expect(toOutcome(caught)).toBe("error");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Handler — resultado acima de 1000 linhas → truncado: true
// ──────────────────────────────────────────────────────────────────────────────

describe("biConsultaAvancada — handler: truncamento de linhas", () => {
  beforeEach(() => {
    mockValidarSqlSelect.mockResolvedValue({ ok: true });
    mockGetBiPool.mockReturnValue(mockPoolInstance as never);
    // Simular 1001 linhas retornadas (após o cap de LIMIT 1001)
    const manyRows = Array.from({ length: 1001 }, (_, i) => ({ id: i }));
    mockQuery.mockResolvedValue({
      fields: [{ name: "id" }],
      rows: manyRows,
    });
  });

  it("truncado: true quando resultado excede 1000 linhas", async () => {
    const result = await biConsultaAvancada.handler(
      { sql: "SELECT id FROM fato_pedido" },
      ctx,
    );
    expect(result.truncado).toBe(true);
    expect(result.linhas.length).toBeLessThanOrEqual(1000);
    expect(result.totalLinhas).toBeLessThanOrEqual(1000);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Visibilidade por role
// ──────────────────────────────────────────────────────────────────────────────

describe("biConsultaAvancada — visibilidade por role", () => {
  const allTools = [biConsultaAvancada as never];

  it("super_admin vê a tool", () => {
    const visible = visibleTools(allTools, makeUser("super_admin"));
    expect(visible.map((t) => t.id)).toContain("bi_consulta_avancada");
  });

  it("admin vê a tool", () => {
    const visible = visibleTools(allTools, makeUser("admin"));
    expect(visible.map((t) => t.id)).toContain("bi_consulta_avancada");
  });

  it("manager NÃO vê a tool", () => {
    const visible = visibleTools(allTools, makeUser("manager"));
    expect(visible.map((t) => t.id)).not.toContain("bi_consulta_avancada");
  });

  it("viewer NÃO vê a tool", () => {
    const visible = visibleTools(allTools, makeUser("viewer"));
    expect(visible.map((t) => t.id)).not.toContain("bi_consulta_avancada");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// assertToolAllowed por role
// ──────────────────────────────────────────────────────────────────────────────

describe("biConsultaAvancada — assertToolAllowed", () => {
  it("super_admin pode invocar", () => {
    expect(() =>
      assertToolAllowed(biConsultaAvancada as never, makeUser("super_admin")),
    ).not.toThrow();
  });

  it("admin pode invocar", () => {
    expect(() =>
      assertToolAllowed(biConsultaAvancada as never, makeUser("admin")),
    ).not.toThrow();
  });

  it("manager lança DomainDeniedError", () => {
    expect(() =>
      assertToolAllowed(biConsultaAvancada as never, makeUser("manager")),
    ).toThrow(DomainDeniedError);
  });

  it("viewer lança DomainDeniedError", () => {
    expect(() =>
      assertToolAllowed(biConsultaAvancada as never, makeUser("viewer")),
    ).toThrow(DomainDeniedError);
  });
});
