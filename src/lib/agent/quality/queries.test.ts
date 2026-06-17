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

import {
  calculateKpis,
  getDistinctRodadas,
  type RawEvalCounts,
} from "@/lib/agent/quality/queries";
import { prisma } from "@/lib/prisma";

describe("getDistinctRodadas , origens Bubble e WhatsApp separadas (F5 E)", () => {
  const queryRaw = prisma.$queryRaw as jest.Mock;
  const filters = {
    periodStart: new Date("2026-06-01T00:00:00Z"),
    periodEnd: new Date("2026-06-17T00:00:00Z"),
  } as Parameters<typeof getDistinctRodadas>[0];

  it("emite duas origens distintas (bubble antes de whatsapp), sem somar", async () => {
    queryRaw
      .mockResolvedValueOnce([]) // auditRows
      .mockResolvedValueOnce([
        { channel: "in_app", count: 3 },
        { channel: "whatsapp", count: 2 },
      ]); // virtualRows

    const out = await getDistinctRodadas(filters);
    expect(out).toEqual([
      { marker: "__origem:agente-nex-bubble", count: 3 },
      { marker: "__origem:agente-nex-whatsapp", count: 2 },
    ]);
  });

  it("omite a origem de um canal sem avaliacao", async () => {
    queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ channel: "in_app", count: 4 }]);

    const out = await getDistinctRodadas(filters);
    expect(out).toEqual([{ marker: "__origem:agente-nex-bubble", count: 4 }]);
  });
});

describe("calculateKpis", () => {
  it("computes % CORRETO excluding PENDENTE and FALHA_TECNICA", () => {
    const counts: RawEvalCounts = {
      CORRETO: 200,
      PARCIAL: 50,
      ERRADO: 30,
      FORA_DO_ESCOPO: 20,
      PENDENTE: 100,
      REAVALIAR: 0,
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
      REAVALIAR: 0,
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
      REAVALIAR: 0,
      FALHA_TECNICA: 0,
    };
    expect(calculateKpis(counts).percentCorreto).toBe(100);
  });
});
