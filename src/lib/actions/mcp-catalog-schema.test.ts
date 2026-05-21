/**
 * Testes da Server Action getMcpCatalogSchema.
 *
 * Agora a action busca via fetch() do endpoint GET /api/mcp/catalog-schema
 * (sem importar código do container mcp/). Mockamos global.fetch.
 */

// ──────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────

const mockRequireSuperAdmin = jest.fn();

jest.mock("@/lib/actions/_helpers", () => ({
  requireSuperAdmin: mockRequireSuperAdmin,
}));

// Catálogo mock retornado pelo endpoint
const mockCatalogResponse = {
  tools: [
    {
      id: "estoque_saldo_produto",
      operation: "read",
      module: "estoque",
      descricao: "Saldo de estoque por produto",
      capability: null,
      sensitive: false,
      addedInVersion: 2,
      inputSchemaKeys: ["produto_id"],
      examples: [],
    },
    {
      id: "crm.res_partner.create",
      operation: "write",
      module: "crm",
      descricao: "Cria parceiro no Odoo",
      capability: "crm.create",
      sensitive: false,
      addedInVersion: 2,
      inputSchemaKeys: ["name", "email"],
      examples: [
        { language: "curl", description: "Exemplo básico", code: "curl -X POST ..." },
      ],
    },
    // tool sem módulo significativo — deve aparecer como "outros"
    {
      id: "registrar_lacuna",
      operation: "read",
      module: "outros",
      descricao: "Registra lacuna",
      capability: null,
      sensitive: false,
      addedInVersion: null,
      inputSchemaKeys: [],
      examples: [],
    },
  ],
  count: 3,
  generatedAt: new Date().toISOString(),
};

// Helper para criar mock de fetch
function createFetchMock(response: unknown, ok = true, status = 200) {
  return jest.fn().mockResolvedValue({
    ok,
    status,
    json: jest.fn().mockResolvedValue(response),
  });
}

// ──────────────────────────────────────────────
// Import após mocks
// ──────────────────────────────────────────────

import { getMcpCatalogSchema } from "./mcp-catalog-schema";

// ──────────────────────────────────────────────
// Setup
// ──────────────────────────────────────────────

const ORIGINAL_MCP_URL = process.env.MCP_URL;

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireSuperAdmin.mockResolvedValue({ id: "sa", platformRole: "super_admin" });
  process.env.MCP_URL = "http://mcp:3100";
  global.fetch = createFetchMock(mockCatalogResponse);
});

afterEach(() => {
  process.env.MCP_URL = ORIGINAL_MCP_URL;
});

// ──────────────────────────────────────────────
// Tests — auth
// ──────────────────────────────────────────────

describe("getMcpCatalogSchema — auth", () => {
  it("retorna erro se não for super_admin", async () => {
    mockRequireSuperAdmin.mockRejectedValue(new Error("Acesso negado — requer super_admin"));
    const result = await getMcpCatalogSchema();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/super_admin/);
  });

  it("não chama fetch se auth falhar", async () => {
    mockRequireSuperAdmin.mockRejectedValue(new Error("Acesso negado"));
    await getMcpCatalogSchema();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────
// Tests — catálogo via fetch
// ──────────────────────────────────────────────

describe("getMcpCatalogSchema — catálogo via fetch", () => {
  it("chama o endpoint correto", async () => {
    await getMcpCatalogSchema();
    expect(global.fetch).toHaveBeenCalledWith(
      "http://mcp:3100/api/mcp/catalog-schema",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("retorna catálogo agrupado por módulo", async () => {
    const result = await getMcpCatalogSchema();
    expect(result.success).toBe(true);
    if (!result.success) return;

    const modules = result.data.map((m) => m.module);
    expect(modules).toContain("crm");
    expect(modules).toContain("estoque");
  });

  it("categoriza tools read e write corretamente", async () => {
    const result = await getMcpCatalogSchema();
    expect(result.success).toBe(true);
    if (!result.success) return;

    const estoque = result.data.find((m) => m.module === "estoque");
    const crm = result.data.find((m) => m.module === "crm");

    expect(estoque?.readTools).toHaveLength(1);
    expect(estoque?.writeTools).toHaveLength(0);
    expect(crm?.writeTools).toHaveLength(1);
  });

  it("serializa capability da write tool corretamente", async () => {
    const result = await getMcpCatalogSchema();
    expect(result.success).toBe(true);
    if (!result.success) return;

    const crm = result.data.find((m) => m.module === "crm");
    const writeTool = crm?.writeTools[0];
    expect(writeTool?.capability).toBe("crm.create");
  });

  it("inclui examples quando presentes", async () => {
    const result = await getMcpCatalogSchema();
    expect(result.success).toBe(true);
    if (!result.success) return;

    const crm = result.data.find((m) => m.module === "crm");
    expect(crm?.writeTools[0].examples).toHaveLength(1);
    expect(crm?.writeTools[0].examples[0].language).toBe("curl");
  });

  it("ordena módulos alfabeticamente", async () => {
    const result = await getMcpCatalogSchema();
    expect(result.success).toBe(true);
    if (!result.success) return;

    const modules = result.data.map((m) => m.module);
    const sorted = [...modules].sort((a, b) => a.localeCompare(b));
    expect(modules).toEqual(sorted);
  });
});

// ──────────────────────────────────────────────
// Tests — fallback gracioso
// ──────────────────────────────────────────────

describe("getMcpCatalogSchema — fallback gracioso", () => {
  it("retorna unavailable=true se MCP_URL não configurado", async () => {
    delete process.env.MCP_URL;
    const result = await getMcpCatalogSchema();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.unavailable).toBe(true);
    expect(result.data).toHaveLength(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("retorna unavailable=true se MCP_URL vazio", async () => {
    process.env.MCP_URL = "";
    const result = await getMcpCatalogSchema();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.unavailable).toBe(true);
  });

  it("retorna unavailable=true se fetch lança (MCP offline)", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await getMcpCatalogSchema();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.unavailable).toBe(true);
    expect(result.data).toHaveLength(0);
  });

  it("retorna unavailable=true se MCP retorna status não-ok (503)", async () => {
    global.fetch = createFetchMock({}, false, 503);
    const result = await getMcpCatalogSchema();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.unavailable).toBe(true);
  });

  it("retorna data vazia se response.tools não for array", async () => {
    global.fetch = createFetchMock({ count: 0 }); // sem campo tools
    const result = await getMcpCatalogSchema();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(0);
    // Não é unavailable — MCP respondeu 200, só não tem tools
    expect(result.unavailable).toBeUndefined();
  });
});
