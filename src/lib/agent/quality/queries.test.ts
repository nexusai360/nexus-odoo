jest.mock("@/lib/prisma", () => ({
  prisma: {
    conversationQualityEvaluation: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
    message: { findUnique: jest.fn() },
    $queryRaw: jest.fn(),
  },
}));

import { calculateKpis, type RawEvalCounts } from "@/lib/agent/quality/queries";

describe("calculateKpis", () => {
  it("computes % CORRETO excluding PENDENTE and FALHA_TECNICA", () => {
    const counts: RawEvalCounts = {
      CORRETO: 200,
      PARCIAL: 50,
      ERRADO: 30,
      FORA_DO_ESCOPO: 20,
      PENDENTE: 100,
      FALHA_TECNICA: 5,
    };
    const kpis = calculateKpis(counts);
    expect(kpis.totalAvaliado).toBe(300);
    expect(kpis.percentCorreto).toBeCloseTo(66.67, 1);
    expect(kpis.pendentes).toBe(100);
    expect(kpis.falhasTecnicas).toBe(5);
  });

  it("returns null percent when no evaluations exist", () => {
    const counts: RawEvalCounts = {
      CORRETO: 0,
      PARCIAL: 0,
      ERRADO: 0,
      FORA_DO_ESCOPO: 0,
      PENDENTE: 50,
      FALHA_TECNICA: 0,
    };
    const kpis = calculateKpis(counts);
    expect(kpis.totalAvaliado).toBe(0);
    expect(kpis.percentCorreto).toBeNull();
  });

  it("returns 100% when all are CORRETO", () => {
    const counts: RawEvalCounts = {
      CORRETO: 10,
      PARCIAL: 0,
      ERRADO: 0,
      FORA_DO_ESCOPO: 0,
      PENDENTE: 0,
      FALHA_TECNICA: 0,
    };
    expect(calculateKpis(counts).percentCorreto).toBe(100);
  });
});
