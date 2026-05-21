/**
 * Testes da Server Action queryAuditLogs.
 */

// ──────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────

const mockRequireSuperAdmin = jest.fn();
const mockFindMany = jest.fn();
const mockCount = jest.fn();

jest.mock("@/lib/actions/_helpers", () => ({
  requireSuperAdmin: mockRequireSuperAdmin,
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    mcpAuditLog: {
      findMany: mockFindMany,
      count: mockCount,
    },
  },
}));

// ──────────────────────────────────────────────
// Import após mocks
// ──────────────────────────────────────────────

import { queryAuditLogs } from "./mcp-audit-query";

// ──────────────────────────────────────────────
// Sample data
// ──────────────────────────────────────────────

const makeRow = (overrides: Record<string, unknown> = {}) => ({
  id: "uuid-1",
  userId: "user-1",
  apiKeyId: null,
  apiKey: null,
  tool: "estoque_saldo_produto",
  module: "estoque",
  action: null,
  capability: null,
  operation: "read",
  authMode: "api_key",
  status: "success",
  outcome: "success",
  durationMs: 45,
  rowCount: 10,
  requestId: "req-123",
  idempotencyKey: null,
  errorCode: null,
  errorMessage: null,
  httpStatus: 200,
  ipAddress: "127.0.0.1",
  userAgent: "n8n/1.0",
  eventName: null,
  payload: null,
  result: null,
  snapshotBefore: null,
  snapshotAfter: null,
  params: { armazemId: 1 },
  criadoEm: new Date("2026-05-20T10:00:00Z"),
  ...overrides,
});

// ──────────────────────────────────────────────
// Setup
// ──────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireSuperAdmin.mockResolvedValue({ id: "user-sa", platformRole: "super_admin" });
  mockFindMany.mockResolvedValue([]);
  mockCount.mockResolvedValue(0);
});

// ──────────────────────────────────────────────
// queryAuditLogs — auth
// ──────────────────────────────────────────────

describe("queryAuditLogs — auth", () => {
  it("retorna erro se não for super_admin", async () => {
    mockRequireSuperAdmin.mockRejectedValue(new Error("Acesso negado — requer super_admin"));
    const result = await queryAuditLogs({});
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/super_admin/);
  });
});

// ──────────────────────────────────────────────
// queryAuditLogs — happy path
// ──────────────────────────────────────────────

describe("queryAuditLogs — happy path", () => {
  it("retorna lista vazia quando não há logs", async () => {
    const result = await queryAuditLogs({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items).toHaveLength(0);
      expect(result.data.nextCursor).toBeNull();
      expect(result.data.total).toBe(0);
    }
  });

  it("retorna itens mapeados corretamente", async () => {
    const row = makeRow();
    mockFindMany.mockResolvedValue([row]);
    mockCount.mockResolvedValue(1);

    const result = await queryAuditLogs({});
    expect(result.success).toBe(true);
    if (result.success) {
      const item = result.data.items[0];
      expect(item.id).toBe("uuid-1");
      expect(item.tool).toBe("estoque_saldo_produto");
      expect(item.status).toBe("success");
      expect(item.durationMs).toBe(45);
      expect(item.criadoEm).toBe("2026-05-20T10:00:00.000Z");
    }
  });

  it("serializa apiKeyLast4 quando apiKey está presente", async () => {
    const row = makeRow({ apiKey: { last4: "ab12" }, apiKeyId: "key-uuid" });
    mockFindMany.mockResolvedValue([row]);
    mockCount.mockResolvedValue(1);

    const result = await queryAuditLogs({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items[0].apiKeyLast4).toBe("ab12");
    }
  });
});

// ──────────────────────────────────────────────
// queryAuditLogs — paginação
// ──────────────────────────────────────────────

describe("queryAuditLogs — paginação", () => {
  it("define nextCursor quando há mais de 50 itens", async () => {
    // Retorna PAGE_SIZE + 1 = 51 itens — todos com a mesma data base, offset por segundos
    const baseDate = new Date("2026-05-20T10:00:00.000Z");
    const rows = Array.from({ length: 51 }, (_, i) =>
      makeRow({ id: `uuid-${i}`, criadoEm: new Date(baseDate.getTime() - i * 1000) }),
    );
    mockFindMany.mockResolvedValue(rows);
    mockCount.mockResolvedValue(100);

    const result = await queryAuditLogs({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items).toHaveLength(50);
      expect(result.data.nextCursor).not.toBeNull();
      // cursor deve conter ISO date + | + id
      expect(result.data.nextCursor).toMatch(/\|uuid-49$/);
    }
  });

  it("nextCursor é null quando há exatamente 50 itens", async () => {
    const rows = Array.from({ length: 50 }, (_, i) =>
      makeRow({ id: `uuid-${i}`, criadoEm: new Date("2026-05-20T10:00:00Z") }),
    );
    mockFindMany.mockResolvedValue(rows);
    mockCount.mockResolvedValue(50);

    const result = await queryAuditLogs({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nextCursor).toBeNull();
    }
  });
});

// ──────────────────────────────────────────────
// queryAuditLogs — filtros inválidos
// ──────────────────────────────────────────────

describe("queryAuditLogs — validação de filtros", () => {
  it("retorna erro em filtros com UUID inválido", async () => {
    const result = await queryAuditLogs({ apiKeyId: "not-a-uuid" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/[Ii]nválido/);
  });
});
