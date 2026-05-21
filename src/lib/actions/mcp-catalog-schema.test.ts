/**
 * Testes da Server Action getMcpCatalogSchema.
 */

// ──────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────

const mockRequireSuperAdmin = jest.fn();

jest.mock("@/lib/actions/_helpers", () => ({
  requireSuperAdmin: mockRequireSuperAdmin,
}));

// Catálogo mock com 1 read tool + 1 write tool
jest.mock("../../../mcp/catalog/index", () => ({
  catalogo: [
    {
      id: "estoque_saldo_produto",
      dominio: "estoque",
      descricao: "Saldo de estoque por produto",
      inputSchemaShape: {},
      inputSchema: {},
      outputSchema: {},
      addedInVersion: 2,
      examples: [],
      handler: async () => ({}),
    },
    {
      id: "crm.res_partner.create",
      operation: "write",
      module: "crm",
      descricao: "Cria parceiro no Odoo",
      inputSchemaShape: {},
      inputSchema: {},
      outputSchema: {},
      capability: { module: "crm", action: "create" },
      sensitive: false,
      odooModel: "res.partner",
      eventName: "crm.res_partner.created",
      addedInVersion: 2,
      requiresExternalAuth: true,
      examples: [
        { language: "curl", description: "Exemplo básico", code: "curl -X POST ..." },
      ],
      handler: async () => ({}),
    },
    // tool sempreVisivel — deve ser excluída do catálogo público
    {
      id: "registrar_lacuna",
      sempreVisivel: true,
      descricao: "Registra lacuna",
      inputSchemaShape: {},
      inputSchema: {},
      outputSchema: {},
      handler: async () => ({}),
    },
  ],
}));

jest.mock("../../../mcp/catalog/types", () => ({
  isWriteToolEntry: (entry: unknown) =>
    typeof entry === "object" &&
    entry !== null &&
    (entry as { operation?: string }).operation === "write",
}));

// ──────────────────────────────────────────────
// Import após mocks
// ──────────────────────────────────────────────

import { getMcpCatalogSchema } from "./mcp-catalog-schema";

// ──────────────────────────────────────────────
// Setup
// ──────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireSuperAdmin.mockResolvedValue({ id: "sa", platformRole: "super_admin" });
});

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

describe("getMcpCatalogSchema — auth", () => {
  it("retorna erro se não for super_admin", async () => {
    mockRequireSuperAdmin.mockRejectedValue(new Error("Acesso negado — requer super_admin"));
    const result = await getMcpCatalogSchema();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/super_admin/);
  });
});

describe("getMcpCatalogSchema — catálogo", () => {
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

  it("exclui tools sempreVisivel (domínio-neutro)", async () => {
    const result = await getMcpCatalogSchema();
    expect(result.success).toBe(true);
    if (!result.success) return;

    const allIds = result.data.flatMap((m) => [
      ...m.readTools.map((t) => t.id),
      ...m.writeTools.map((t) => t.id),
    ]);
    expect(allIds).not.toContain("registrar_lacuna");
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
});
