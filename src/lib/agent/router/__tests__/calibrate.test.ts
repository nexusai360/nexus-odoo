import { describe, expect, it, beforeEach, jest } from "@jest/globals";

/**
 * Testa a matematica de KPIs do nucleo de calibragem (Wave E2/E4) isolando
 * pickDomains e o filesystem. O dataset e as decisoes sao roteirizados para
 * exercer: top-1 certo, top-1 errado mas top-K certo, discordancia total,
 * fallback e label nao mapeavel (edge_cases nao entra no denominador).
 */

type Decision = {
  pickedDomains: string[];
  topScore: number | null;
  fallback: { triggered: boolean; reason?: string };
  pickDurationMs: number;
};

const DATASET: Record<string, string[]> = {
  estoque: ["q_estoque_ok", "q_estoque_topk"],
  financeiro: ["q_financeiro_miss"],
  edge_cases: ["q_edge_fallback"],
};

const DECISIONS: Record<string, Decision> = {
  // top-1 correto
  q_estoque_ok: {
    pickedDomains: ["estoque"],
    topScore: 0.9,
    fallback: { triggered: false },
    pickDurationMs: 10,
  },
  // top-1 errado, mas label aparece no top-K
  q_estoque_topk: {
    pickedDomains: ["financeiro", "estoque"],
    topScore: 0.7,
    fallback: { triggered: false },
    pickDurationMs: 20,
  },
  // discordancia total: label fora do top-K
  q_financeiro_miss: {
    pickedDomains: ["estoque"],
    topScore: 0.6,
    fallback: { triggered: false },
    pickDurationMs: 30,
  },
  // label nao mapeavel + fallback
  q_edge_fallback: {
    pickedDomains: [],
    topScore: null,
    fallback: { triggered: true, reason: "below_threshold" },
    pickDurationMs: 40,
  },
};

const mockPick = jest.fn<(q: string) => Promise<Decision>>();
jest.mock("../pick-domains", () => ({
  pickDomains: (q: string) => mockPick(q),
}));

jest.mock("fs", () => ({
  readFileSync: () => JSON.stringify(DATASET),
  writeFileSync: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runCalibration } = require("../calibrate") as {
  runCalibration: (o?: {
    writeReport?: boolean;
    threshold?: number;
    topK?: number;
  }) => Promise<{
    datasetSize: number;
    mappableCount: number;
    top1CorrectCount: number;
    topKCorrectCount: number;
    top1Accuracy: number;
    topKAccuracy: number;
    fallbacks: number;
    latencyP50: number;
    latencyP95: number;
    perDomain: Array<{
      domain: string;
      total: number;
      top1: number;
      topK: number;
    }>;
    promotable: boolean;
    reportPath: string | null;
  }>;
};

describe("runCalibration", () => {
  beforeEach(() => {
    mockPick.mockReset();
    mockPick.mockImplementation(async (q: string) => DECISIONS[q]!);
  });

  it("calcula Top-1/Top-K so sobre labels mapeaveis (exclui edge_cases)", async () => {
    const r = await runCalibration({ writeReport: false });

    expect(r.datasetSize).toBe(4);
    // edge_cases nao conta para acuracia.
    expect(r.mappableCount).toBe(3);
    // Top-1: so q_estoque_ok acerta.
    expect(r.top1CorrectCount).toBe(1);
    expect(r.top1Accuracy).toBeCloseTo(1 / 3, 5);
    // Top-K: q_estoque_ok e q_estoque_topk.
    expect(r.topKCorrectCount).toBe(2);
    expect(r.topKAccuracy).toBeCloseTo(2 / 3, 5);
  });

  it("conta fallbacks sobre o dataset inteiro", async () => {
    const r = await runCalibration({ writeReport: false });
    expect(r.fallbacks).toBe(1);
  });

  it("agrega acuracia por dominio", async () => {
    const r = await runCalibration({ writeReport: false });
    const estoque = r.perDomain.find((d) => d.domain === "estoque");
    const financeiro = r.perDomain.find((d) => d.domain === "financeiro");
    expect(estoque).toEqual({ domain: "estoque", total: 2, top1: 1, topK: 2 });
    expect(financeiro).toEqual({
      domain: "financeiro",
      total: 1,
      top1: 0,
      topK: 0,
    });
  });

  it("calcula percentis de latencia", async () => {
    const r = await runCalibration({ writeReport: false });
    // durations ordenadas [10,20,30,40]; p50 -> idx floor(0.5*4)=2 -> 30.
    expect(r.latencyP50).toBe(30);
    // p95 -> idx floor(0.95*4)=3 -> 40.
    expect(r.latencyP95).toBe(40);
  });

  it("marca promotable=false quando Top-1 < 95%", async () => {
    const r = await runCalibration({ writeReport: false });
    expect(r.promotable).toBe(false);
    expect(r.reportPath).toBeNull();
  });

  it("marca promotable=true quando todas as mapeaveis acertam Top-1", async () => {
    mockPick.mockImplementation(async (q: string) => {
      if (q === "q_edge_fallback") return DECISIONS[q]!;
      // Forca top-1 = label correto para toda pergunta mapeavel.
      const label = q.startsWith("q_estoque") ? "estoque" : "financeiro";
      return {
        pickedDomains: [label],
        topScore: 0.95,
        fallback: { triggered: false },
        pickDurationMs: 5,
      };
    });
    const r = await runCalibration({ writeReport: false });
    expect(r.top1Accuracy).toBe(1);
    expect(r.promotable).toBe(true);
  });
});
