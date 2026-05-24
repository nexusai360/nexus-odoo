import { logUsage } from "./usage-logger";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    llmUsage: {
      create: jest.fn(),
    },
  },
}));

jest.mock("./exchange-rate", () => ({
  getUsdBrlRate: jest.fn(),
}));

jest.mock("./catalog", () => ({
  calculateCost: jest.fn(),
}));

const { prisma } = jest.requireMock("@/lib/prisma");
const { getUsdBrlRate } = jest.requireMock("./exchange-rate");
const { calculateCost } = jest.requireMock("./catalog");

beforeEach(() => {
  jest.clearAllMocks();
  prisma.llmUsage.create.mockResolvedValue({});
});

describe("logUsage", () => {
  test("grava com costKnown=true e costUsd calculado", async () => {
    calculateCost.mockReturnValue({ costUsd: 0.0025, costKnown: true });
    getUsdBrlRate.mockResolvedValue({ rate: 5.5, spread: 1.1, stale: false });

    await logUsage({
      provider: "anthropic",
      model: "claude-sonnet-4-7",
      tokensInput: 1000,
      tokensOutput: 500,
      userId: "user-1",
      isPlayground: false,
    });

    expect(prisma.llmUsage.create).toHaveBeenCalledTimes(1);
    const data = prisma.llmUsage.create.mock.calls[0][0].data;
    expect(data.costKnown).toBe(true);
    expect(data.costUsd).toBeCloseTo(0.0025);
    expect(data.costBrl).toBeDefined();
    expect(data.rateStale).toBe(false);
  });

  test("costKnown=false → costUsd é null (BUG 1 corrigido)", async () => {
    calculateCost.mockReturnValue({ costUsd: null, costKnown: false });
    getUsdBrlRate.mockResolvedValue({ rate: 5.5, spread: 1.1, stale: false });

    await logUsage({
      provider: "openrouter",
      model: "openrouter/unknown-model",
      tokensInput: 100,
      tokensOutput: 50,
    });

    const data = prisma.llmUsage.create.mock.calls[0][0].data;
    expect(data.costKnown).toBe(false);
    expect(data.costUsd).toBeNull();
    expect(data.costBrl).toBeNull();
  });

  test("cotação stale=true → rateStale=true no registro (BUG 5 corrigido)", async () => {
    calculateCost.mockReturnValue({ costUsd: 0.001, costKnown: true });
    getUsdBrlRate.mockResolvedValue({ rate: 5.2, spread: 1.1, stale: true });

    await logUsage({
      provider: "openai",
      model: "gpt-4o-mini",
      tokensInput: 500,
      tokensOutput: 200,
    });

    const data = prisma.llmUsage.create.mock.calls[0][0].data;
    expect(data.rateStale).toBe(true);
    expect(data.costBrl).not.toBeNull(); // ainda calcula, mas marcado como stale
  });

  test("getUsdBrlRate nunca retorna null , usa spread e grava rateSpread (BUG 6)", async () => {
    calculateCost.mockReturnValue({ costUsd: 0.005, costKnown: true });
    getUsdBrlRate.mockResolvedValue({ rate: 5.8, spread: 1.1, stale: false });

    await logUsage({
      provider: "anthropic",
      model: "claude-haiku-3-5",
      tokensInput: 200,
      tokensOutput: 100,
    });

    const data = prisma.llmUsage.create.mock.calls[0][0].data;
    expect(data.rateSpread).toBeCloseTo(1.1);
    expect(data.costBrl).not.toBeNull();
  });

  test("falha silenciosa , não lança se prisma.create falhar", async () => {
    calculateCost.mockReturnValue({ costUsd: 0.001, costKnown: true });
    getUsdBrlRate.mockResolvedValue({ rate: 5.5, spread: 1.1, stale: false });
    prisma.llmUsage.create.mockRejectedValue(new Error("DB error"));

    await expect(
      logUsage({ provider: "openai", model: "gpt-4o", tokensInput: 10, tokensOutput: 5 }),
    ).resolves.not.toThrow();
  });

  test("grava isPlayground e promptChars/responseChars quando fornecidos", async () => {
    calculateCost.mockReturnValue({ costUsd: 0.001, costKnown: true });
    getUsdBrlRate.mockResolvedValue({ rate: 5.5, spread: 1.1, stale: false });

    await logUsage({
      provider: "anthropic",
      model: "claude-haiku-3-5",
      tokensInput: 100,
      tokensOutput: 50,
      promptChars: 400,
      responseChars: 200,
      isPlayground: true,
    });

    const data = prisma.llmUsage.create.mock.calls[0][0].data;
    expect(data.isPlayground).toBe(true);
    expect(data.promptChars).toBe(400);
    expect(data.responseChars).toBe(200);
  });
});
