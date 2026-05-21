/**
 * Testes da Server Action getMcpCatalogSchema.
 *
 * O catálogo agora vem do snapshot in-app `src/lib/mcp-catalog-snapshot.json`
 * (gerado por scripts/gen-mcp-catalog-snapshot.ts), sem depender do container
 * mcp. Os testes exercem o agrupamento (groupCatalogTools) com dados mock e a
 * action contra o snapshot real.
 */

// ──────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────

const mockRequireSuperAdmin = jest.fn();

jest.mock("@/lib/actions/_helpers", () => ({
  requireSuperAdmin: mockRequireSuperAdmin,
}));

// ──────────────────────────────────────────────
// Import após mocks
// ──────────────────────────────────────────────

import { getMcpCatalogSchema, groupCatalogTools } from "./mcp-catalog-schema";

// Tools mock para exercitar o agrupamento isoladamente.
const mockTools = [
  {
    id: "estoque_saldo_produto",
    operation: "read" as const,
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
    operation: "write" as const,
    module: "crm",
    descricao: "Cria parceiro no Odoo",
    capability: "crm.create",
    sensitive: false,
    addedInVersion: 2,
    inputSchemaKeys: ["name", "email"],
    examples: [{ language: "curl", description: "Exemplo básico", code: "curl -X POST ..." }],
  },
  {
    id: "registrar_lacuna",
    operation: "read" as const,
    module: "outros",
    descricao: "Registra lacuna",
    capability: null,
    sensitive: false,
    addedInVersion: null,
    inputSchemaKeys: [],
    examples: [],
  },
];

// ──────────────────────────────────────────────
// Setup
// ──────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireSuperAdmin.mockResolvedValue({ id: "sa", platformRole: "super_admin" });
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
});

// ──────────────────────────────────────────────
// Tests — agrupamento (groupCatalogTools)
// ──────────────────────────────────────────────

describe("groupCatalogTools", () => {
  it("agrupa tools por módulo", async () => {
    const data = await groupCatalogTools(mockTools);
    const modules = data.map((m) => m.module);
    expect(modules).toContain("crm");
    expect(modules).toContain("estoque");
    expect(modules).toContain("outros");
  });

  it("categoriza tools read e write corretamente", async () => {
    const data = await groupCatalogTools(mockTools);
    const estoque = data.find((m) => m.module === "estoque");
    const crm = data.find((m) => m.module === "crm");
    expect(estoque?.readTools).toHaveLength(1);
    expect(estoque?.writeTools).toHaveLength(0);
    expect(crm?.writeTools).toHaveLength(1);
  });

  it("serializa capability da write tool corretamente", async () => {
    const data = await groupCatalogTools(mockTools);
    const crm = data.find((m) => m.module === "crm");
    expect(crm?.writeTools[0].capability).toBe("crm.create");
  });

  it("inclui examples quando presentes", async () => {
    const data = await groupCatalogTools(mockTools);
    const crm = data.find((m) => m.module === "crm");
    expect(crm?.writeTools[0].examples).toHaveLength(1);
    expect(crm?.writeTools[0].examples[0].language).toBe("curl");
  });

  it("ordena módulos alfabeticamente", async () => {
    const data = await groupCatalogTools(mockTools);
    const modules = data.map((m) => m.module);
    const sorted = [...modules].sort((a, b) => a.localeCompare(b));
    expect(modules).toEqual(sorted);
  });

  it("retorna vazio para lista de tools vazia", async () => {
    const data = await groupCatalogTools([]);
    expect(data).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────
// Tests — catálogo via snapshot in-app
// ──────────────────────────────────────────────

describe("getMcpCatalogSchema — snapshot in-app", () => {
  it("retorna o catálogo agrupado do snapshot", async () => {
    const result = await getMcpCatalogSchema();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.length).toBeGreaterThan(0);
  });

  it("o snapshot inclui o domínio de estoque", async () => {
    const result = await getMcpCatalogSchema();
    expect(result.success).toBe(true);
    if (!result.success) return;
    const modules = result.data.map((m) => m.module);
    expect(modules).toContain("estoque");
  });

  it("não fica indisponível com o snapshot presente", async () => {
    const result = await getMcpCatalogSchema();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.unavailable).toBeUndefined();
  });
});
