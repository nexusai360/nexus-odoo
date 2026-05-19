/**
 * Testes para usage-stats.ts — Task 5.1 (TDD).
 *
 * Coberturas:
 * - getUsageStats: totalConversations (count Conversation) vs totalIterations (count LlmUsage) — BUG 8
 * - getUsageStats: costUsd ignora rows costKnown=false mas conta unknownCount
 * - getUsageStats: retorna byModel, byProvider, byDay, byHour
 * - getUsageDetails: paginação, filtros, totals
 */

import {
  getUsageStats,
  getUsageDetails,
  type UsageSummaryV2,
  type UsageDetailsResult,
} from "./usage-stats";

// ---------------------------------------------------------------------------
// Mock do Prisma
// ---------------------------------------------------------------------------

const mockFindMany = jest.fn();
const mockUsageCount = jest.fn();
const mockConvCount = jest.fn();
const mockGroupBy = jest.fn();
const mockFindFirst = jest.fn();
const mockAggregate = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    llmUsage: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockUsageCount(...args),
      groupBy: (...args: unknown[]) => mockGroupBy(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      aggregate: (...args: unknown[]) => mockAggregate(...args),
    },
    conversation: {
      count: (...args: unknown[]) => mockConvCount(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date("2026-05-19T10:00:00Z");
const START = new Date("2026-05-01T00:00:00Z");
const END = new Date("2026-05-19T23:59:59Z");

function makeUsageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "uuid-1",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    tokensInput: 1000,
    tokensOutput: 500,
    costUsd: 0.012,
    costBrl: 0.06,
    costKnown: true,
    usdToBrlRate: 5.0,
    rateSpread: 0.02,
    rateStale: false,
    durationMs: 1200,
    createdAt: NOW,
    promptChars: 400,
    responseChars: 200,
    userId: "user-1",
    errorMessage: null,
    isPlayground: false,
    conversationId: "conv-1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Testes de getUsageStats
// ---------------------------------------------------------------------------

describe("getUsageStats", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Setup helper — configura os mocks na ordem esperada pelo Promise.all:
   * [convCount, usageCount, aggregate, byModel, byProvider, byDay, byHour(findMany), unknownCount]
   */
  function setupMocks({
    convCount = 0,
    usageCount = 0,
    aggregate = { _sum: { costUsd: null, costBrl: null, tokensInput: null, tokensOutput: null }, _count: { _all: 0 } },
    byModel = [] as unknown[],
    byProvider = [] as unknown[],
    byDay = [] as unknown[],
    hourlyMode = false,
    byHourRows = [] as unknown[],
    unknownCount = 0,
  } = {}) {
    mockConvCount.mockResolvedValueOnce(convCount);
    mockUsageCount
      .mockResolvedValueOnce(usageCount) // totalIterations
      .mockResolvedValueOnce(unknownCount); // unknownCount
    mockAggregate.mockResolvedValueOnce(aggregate);
    mockGroupBy
      .mockResolvedValueOnce(byModel)
      .mockResolvedValueOnce(byProvider)
      .mockResolvedValueOnce(byDay);
    if (hourlyMode) {
      mockFindMany.mockResolvedValueOnce(byHourRows);
    } else {
      // não chama findMany no modo não-hourly (retorna null via Promise.resolve)
    }
    mockFindFirst.mockResolvedValueOnce(null);
  }

  it("BUG 8: totalConversations ≠ totalIterations — usa contagens separadas", async () => {
    setupMocks({ convCount: 3, usageCount: 5 });

    const result: UsageSummaryV2 = await getUsageStats({ start: START, end: END });

    expect(result.totalConversations).toBe(3);
    expect(result.totalIterations).toBe(5);
    expect(result.totalConversations).not.toBe(result.totalIterations);
  });

  it("ignora costUsd de rows costKnown=false no custo total, mas conta unknownCount", async () => {
    setupMocks({
      convCount: 2,
      usageCount: 4,
      aggregate: { _sum: { costUsd: 0.02, costBrl: 0.1, tokensInput: 3000, tokensOutput: 1500 }, _count: { _all: 3 } },
      unknownCount: 1,
    });

    const result = await getUsageStats({ start: START, end: END });

    expect(result.totalCostUsd).toBeCloseTo(0.02);
    expect(result.unknownCount).toBe(1);
  });

  it("retorna byModel com provider, model, cost, calls", async () => {
    setupMocks({
      convCount: 1,
      usageCount: 2,
      aggregate: { _sum: { costUsd: 0.03, costBrl: 0.15, tokensInput: 3000, tokensOutput: 1500 }, _count: { _all: 2 } },
      byModel: [
        {
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          _sum: { costUsd: 0.03, costBrl: 0.15, tokensInput: 2000, tokensOutput: 1000 },
          _count: { _all: 2 },
        },
      ],
    });

    const result = await getUsageStats({ start: START, end: END });

    expect(result.byModel).toHaveLength(1);
    expect(result.byModel[0]).toMatchObject({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    });
    expect(typeof result.byModel[0].costUsd).toBe("number");
    expect(typeof result.byModel[0].calls).toBe("number");
  });

  it("retorna byProvider com custo e calls", async () => {
    setupMocks({
      convCount: 1,
      usageCount: 3,
      aggregate: { _sum: { costUsd: 0.05, costBrl: 0.25, tokensInput: 5000, tokensOutput: 2000 }, _count: { _all: 3 } },
      byProvider: [
        {
          provider: "openai",
          _sum: { costUsd: 0.05, costBrl: 0.25 },
          _count: { _all: 3 },
        },
      ],
    });

    const result = await getUsageStats({ start: START, end: END });

    expect(result.byProvider).toHaveLength(1);
    expect(result.byProvider[0].provider).toBe("openai");
    expect(typeof result.byProvider[0].costUsd).toBe("number");
    expect(typeof result.byProvider[0].calls).toBe("number");
  });

  it("retorna byDay com day ISO, cost, tokens, calls", async () => {
    setupMocks({
      convCount: 1,
      usageCount: 2,
      aggregate: { _sum: { costUsd: 0.01, costBrl: 0.05, tokensInput: 750, tokensOutput: 250 }, _count: { _all: 2 } },
      byDay: [
        {
          createdAt: new Date("2026-05-10T00:00:00Z"),
          _sum: { costUsd: 0.01, costBrl: 0.05, tokensInput: 500, tokensOutput: 250 },
          _count: { _all: 2 },
        },
      ],
    });

    const result = await getUsageStats({ start: START, end: END });

    expect(result.byDay).toHaveLength(1);
    expect(result.byDay[0].day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof result.byDay[0].costUsd).toBe("number");
    expect(typeof result.byDay[0].tokens).toBe("number");
    expect(typeof result.byDay[0].calls).toBe("number");
  });

  it("retorna byHour quando range <= 24h", async () => {
    const start24 = new Date("2026-05-19T00:00:00Z");
    const end24 = new Date("2026-05-19T23:59:59Z");

    // hora BRT: UTC-3 → 17:00 UTC = 14:00 BRT
    const rowAt14BRT = { createdAt: new Date("2026-05-19T17:00:00Z"), costUsd: 0.005, costBrl: 0.025 };

    mockConvCount.mockResolvedValueOnce(1);
    mockUsageCount
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    mockAggregate.mockResolvedValueOnce({
      _sum: { costUsd: 0.005, costBrl: 0.025, tokensInput: 500, tokensOutput: 250 },
      _count: { _all: 1 },
    });
    mockGroupBy
      .mockResolvedValueOnce([])  // byModel
      .mockResolvedValueOnce([])  // byProvider
      .mockResolvedValueOnce([]); // byDay
    mockFindMany.mockResolvedValueOnce([rowAt14BRT]); // byHour findMany
    mockFindFirst.mockResolvedValueOnce(null);

    const result = await getUsageStats({ start: start24, end: end24 });

    expect(result.byHour).toBeDefined();
    expect(result.byHour).toHaveLength(24);
    // hora 14 (BRT) deve ter calls=1
    expect(result.byHour![14].calls).toBe(1);
  });

  it("retorna zeros quando não há dados", async () => {
    setupMocks({ convCount: 0, usageCount: 0 });

    const result = await getUsageStats({ start: START, end: END });

    expect(result.totalConversations).toBe(0);
    expect(result.totalIterations).toBe(0);
    expect(result.totalCostUsd).toBe(0);
    expect(result.byModel).toHaveLength(0);
    expect(result.byProvider).toHaveLength(0);
    expect(result.byDay).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Testes de getUsageDetails
// ---------------------------------------------------------------------------

describe("getUsageDetails", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("retorna rows, total e totals", async () => {
    const row = makeUsageRow();

    mockFindMany.mockResolvedValueOnce([row]);
    mockUsageCount.mockResolvedValueOnce(1);
    mockAggregate.mockResolvedValueOnce({
      _sum: {
        costUsd: 0.012,
        costBrl: 0.06,
        tokensInput: 1000,
        tokensOutput: 500,
        durationMs: 1200,
      },
      _count: { _all: 1 },
    });

    const result: UsageDetailsResult = await getUsageDetails({
      start: START,
      end: END,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.totals.count).toBe(1);
    expect(typeof result.totals.costUsd).toBe("number");
  });

  it("aplica filtro por provider e model", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    mockUsageCount.mockResolvedValueOnce(0);
    mockAggregate.mockResolvedValueOnce({
      _sum: { costUsd: null, costBrl: null, tokensInput: null, tokensOutput: null, durationMs: null },
      _count: { _all: 0 },
    });

    await getUsageDetails({
      start: START,
      end: END,
      provider: "openai",
      model: "gpt-4o",
    });

    // Verifica que findMany foi chamado com where incluindo provider e model
    const call = mockFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(call.where).toMatchObject({
      provider: "openai",
      model: "gpt-4o",
    });
  });

  it("aplica filtro isPlayground=true", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    mockUsageCount.mockResolvedValueOnce(0);
    mockAggregate.mockResolvedValueOnce({
      _sum: { costUsd: null, costBrl: null, tokensInput: null, tokensOutput: null, durationMs: null },
      _count: { _all: 0 },
    });

    await getUsageDetails({
      start: START,
      end: END,
      isPlayground: true,
    });

    const call = mockFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(call.where).toMatchObject({ isPlayground: true });
  });

  it("mapeia costKnown=false corretamente no row", async () => {
    const unknownRow = makeUsageRow({ costKnown: false, costUsd: null, costBrl: null });

    mockFindMany.mockResolvedValueOnce([unknownRow]);
    mockUsageCount.mockResolvedValueOnce(1);
    mockAggregate.mockResolvedValueOnce({
      _sum: { costUsd: null, costBrl: null, tokensInput: 1000, tokensOutput: 500, durationMs: 1200 },
      _count: { _all: 1 },
    });

    const result = await getUsageDetails({ start: START, end: END });

    expect(result.rows[0].costKnown).toBe(false);
    expect(result.rows[0].costUsd).toBeNull();
  });

  it("respeita limit e offset", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    mockUsageCount.mockResolvedValueOnce(100);
    mockAggregate.mockResolvedValueOnce({
      _sum: { costUsd: null, costBrl: null, tokensInput: null, tokensOutput: null, durationMs: null },
      _count: { _all: 100 },
    });

    await getUsageDetails({ start: START, end: END, limit: 10, offset: 20 });

    const call = mockFindMany.mock.calls[0][0] as { take: number; skip: number };
    expect(call.take).toBe(10);
    expect(call.skip).toBe(20);
  });
});
