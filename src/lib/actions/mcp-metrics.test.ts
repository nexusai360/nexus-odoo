/**
 * Testes das Server Actions de métricas MCP.
 * Gate: super_admin.
 */

// ──────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────

const mockRequireSuperAdmin = jest.fn();
const mockPrismaMcpAuditLogCount = jest.fn();
const mockPrismaMcpAuditLogGroupBy = jest.fn();
const mockPrismaQueryRaw = jest.fn();

jest.mock("@/lib/actions/_helpers", () => ({
  requireSuperAdmin: mockRequireSuperAdmin,
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    mcpAuditLog: {
      count: mockPrismaMcpAuditLogCount,
      groupBy: mockPrismaMcpAuditLogGroupBy,
    },
    $queryRaw: mockPrismaQueryRaw,
  },
}));

// ──────────────────────────────────────────────
// Import após mocks
// ──────────────────────────────────────────────

import { getMcp24hMetrics } from "./mcp-metrics";

// ──────────────────────────────────────────────
// Setup
// ──────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireSuperAdmin.mockResolvedValue({ id: "user-sa", platformRole: "super_admin" });
  mockPrismaMcpAuditLogCount.mockResolvedValue(0);
  mockPrismaMcpAuditLogGroupBy.mockResolvedValue([]);
  mockPrismaQueryRaw.mockResolvedValue([{ p50: null, p99: null }]);
});

// ──────────────────────────────────────────────
// getMcp24hMetrics
// ──────────────────────────────────────────────

describe("getMcp24hMetrics", () => {
  it("retorna métricas zeradas quando não há registros", async () => {
    const result = await getMcp24hMetrics();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalCalls).toBe(0);
      expect(result.data.errorRate).toBe(0);
      expect(result.data.topTools).toHaveLength(0);
      expect(result.data.p50Ms).toBeNull();
      expect(result.data.p99Ms).toBeNull();
    }
  });

  it("calcula error rate corretamente", async () => {
    // 10 total, 2 erros → 20%
    mockPrismaMcpAuditLogCount
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(2); // erros

    const result = await getMcp24hMetrics();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalCalls).toBe(10);
      expect(result.data.errorRate).toBeCloseTo(20, 1);
    }
  });

  it("agrega top tools e seus erros", async () => {
    mockPrismaMcpAuditLogCount
      .mockResolvedValueOnce(50) // total
      .mockResolvedValueOnce(5)  // errors total
      .mockResolvedValueOnce(3)  // errors for tool A
      .mockResolvedValueOnce(2); // errors for tool B

    mockPrismaMcpAuditLogGroupBy.mockResolvedValue([
      { tool: "estoque_listar", _count: { id: 30 } },
      { tool: "financeiro_resumo", _count: { id: 20 } },
    ]);

    const result = await getMcp24hMetrics();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.topTools).toHaveLength(2);
      expect(result.data.topTools[0].tool).toBe("estoque_listar");
      expect(result.data.topTools[0].total).toBe(30);
    }
  });

  it("retorna p50 e p99 da query raw", async () => {
    mockPrismaQueryRaw.mockResolvedValue([{ p50: 42.5, p99: 850.3 }]);

    const result = await getMcp24hMetrics();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.p50Ms).toBe(43); // arredondado
      expect(result.data.p99Ms).toBe(850);
    }
  });

  it("retorna erro quando requireSuperAdmin falha", async () => {
    mockRequireSuperAdmin.mockRejectedValue(new Error("Acesso negado"));

    const result = await getMcp24hMetrics();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Acesso negado");
    }
  });

  it("retorna erro quando prisma falha", async () => {
    mockPrismaMcpAuditLogCount.mockRejectedValue(new Error("DB error"));

    const result = await getMcp24hMetrics();
    expect(result.success).toBe(false);
  });
});
