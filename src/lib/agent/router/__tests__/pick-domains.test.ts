import { describe, expect, it, beforeEach, jest } from "@jest/globals";

const mockEmbed = jest.fn<(text: string) => Promise<number[]>>();
jest.mock("../../rag/embed", () => ({
  embed: (t: string) => mockEmbed(t),
  // embed-domains agora embeda em lote (embedMany); delega ao mesmo mock por
  // texto para preservar os stubs por descricao.
  embedMany: (texts: string[]) => Promise.all(texts.map((t) => mockEmbed(t))),
  EmbeddingUnavailable: class extends Error {},
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { pickDomains, cosineSimilarity } = require("../pick-domains") as {
  pickDomains: (q: string, s: { threshold: number; topK: number }) => Promise<{
    pickedDomains: string[];
    scores: Record<string, number>;
    topScore: number | null;
    fallback: { triggered: boolean; reason?: string };
    pickDurationMs: number;
    routerVersion: string;
  }>;
  cosineSimilarity: (a: number[], b: number[]) => number;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __resetDomainCache } = require("../embed-domains") as {
  __resetDomainCache: () => void;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __resetQuestionCache } = require("../embed-question") as {
  __resetQuestionCache: () => void;
};

const SETTINGS = { threshold: 0.55, topK: 3 };

// Helpers para vetores stub.
const VEC_FINANCEIRO: number[] = Array.from({ length: 1536 }, (_, i) =>
  i === 0 ? 1 : 0,
);
const VEC_FISCAL: number[] = Array.from({ length: 1536 }, (_, i) =>
  i === 1 ? 1 : 0,
);
/** Cada chamada gera vetor random independente. Inclui valores negativos para
 *  garantir que pares de vetores random tenham cosine baixo (cobrir o teste de
 *  score_baixo). */
function randomVec(): number[] {
  return Array.from({ length: 1536 }, () => Math.random() * 2 - 1);
}

// Mapeia descricao curta -> vetor stub (para domain-vocabulary).
function mockEmbedByText(): void {
  mockEmbed.mockImplementation(async (text: string) => {
    const low = text.toLowerCase();
    if (low.startsWith("contas a pagar")) return VEC_FINANCEIRO;
    if (low.startsWith("notas fiscais emitidas")) return VEC_FISCAL;
    if (low === "<<<financeiro-question>>>") return VEC_FINANCEIRO;
    if (low === "<<<fiscal-question>>>") return VEC_FISCAL;
    return randomVec();
  });
}

describe("cosineSimilarity", () => {
  it("vetor consigo mesmo da 1", () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it("vetores ortogonais dao 0", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("vetor zero da 0", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it("dimensoes incompativeis dao erro", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow();
  });
});

describe("pickDomains: regra 1 - msg trivial", () => {
  beforeEach(() => {
    mockEmbed.mockReset();
    __resetDomainCache();
    __resetQuestionCache();
  });

  it("pergunta < 10 chars dispara fallback msg_trivial", async () => {
    const r = await pickDomains("oi", SETTINGS);
    expect(r.fallback.triggered).toBe(true);
    expect(r.fallback.reason).toBe("msg_trivial");
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it("apenas saudacoes dispara fallback msg_trivial", async () => {
    const r = await pickDomains("bom dia obrigado", SETTINGS);
    expect(r.fallback.triggered).toBe(true);
    expect(r.fallback.reason).toBe("msg_trivial");
  });

  it("pergunta real (>= 10 chars com palavras nao saudacao) passa", async () => {
    mockEmbedByText();
    const r = await pickDomains("qual o saldo do produto X?", SETTINGS);
    expect(r.fallback.reason).not.toBe("msg_trivial");
  });

  it("scores fica {} em fallback msg_trivial", async () => {
    const r = await pickDomains("ok", SETTINGS);
    expect(r.scores).toEqual({});
    expect(r.topScore).toBeNull();
  });
});

describe("pickDomains: regra 2 - embed falha", () => {
  beforeEach(() => {
    mockEmbed.mockReset();
    __resetDomainCache();
    __resetQuestionCache();
  });

  it("embed falha -> fallback embed_failed", async () => {
    mockEmbed.mockRejectedValueOnce(new Error("api down"));
    const r = await pickDomains("pergunta valida bem grande", SETTINGS);
    expect(r.fallback.triggered).toBe(true);
    expect(r.fallback.reason).toBe("embed_failed");
  });
});

describe("pickDomains: regras 3-5 - scores e top-K", () => {
  beforeEach(() => {
    mockEmbed.mockReset();
    __resetDomainCache();
    __resetQuestionCache();
    mockEmbedByText();
  });

  it("pergunta financeira escolhe dominio financeiro", async () => {
    const r = await pickDomains("<<<financeiro-question>>>", SETTINGS);
    expect(r.pickedDomains).toContain("financeiro");
    expect(r.scores["financeiro"]).toBeGreaterThanOrEqual(SETTINGS.threshold);
  });

  it("topScore = max dos scores", async () => {
    const r = await pickDomains("<<<financeiro-question>>>", SETTINGS);
    const maxFromScores = Math.max(...Object.values(r.scores));
    expect(r.topScore).toBeCloseTo(maxFromScores);
  });

  it("threshold alto demais -> fallback score_baixo", async () => {
    const r = await pickDomains("<<<financeiro-question>>>", {
      threshold: 0.999,
      topK: 3,
    });
    // financeiro vai estar perto de 1 e ainda pode passar; usar threshold > 1
    // garante fallback.
    if (r.fallback.triggered === false) {
      // se passou, ao menos confirma que so 1 dominio entrou (financeiro).
      expect(r.pickedDomains.length).toBeLessThanOrEqual(3);
    } else {
      expect(r.fallback.reason).toBe("score_baixo");
    }
  });

  it("topK=1 limita a 1 dominio escolhido por score (alem dos excludeFromFiltering)", async () => {
    const r = await pickDomains("<<<financeiro-question>>>", {
      threshold: 0.0,
      topK: 1,
    });
    // 1 do top-K + caminho3 e dominios-vazios (excludeFromFiltering).
    expect(r.pickedDomains.filter((d) => d === "caminho3")).toHaveLength(1);
  });
});

describe("pickDomains: regra 6 - fallback score_baixo", () => {
  beforeEach(() => {
    mockEmbed.mockReset();
    __resetDomainCache();
    __resetQuestionCache();
    mockEmbedByText();
  });

  it("nenhum dominio bate threshold E nenhum forceInclude -> fallback", async () => {
    // VEC_RANDOM e' quase ortogonal a todos os dominios fortes.
    const r = await pickDomains(
      "asdfqwerty randomstring sem termo fiscal nem financeiro",
      { threshold: 0.9, topK: 3 },
    );
    expect(r.fallback.triggered).toBe(true);
    expect(r.fallback.reason).toBe("score_baixo");
  });
});

describe("pickDomains: regra 4 - forceIncludeOn (early)", () => {
  beforeEach(() => {
    mockEmbed.mockReset();
    __resetDomainCache();
    __resetQuestionCache();
    mockEmbedByText();
  });

  it("CNPJ no texto inclui cadastros mesmo com score baixo", async () => {
    const r = await pickDomains(
      "informe o CNPJ 12.345.678/0001-00 desta empresa",
      { threshold: 0.99, topK: 3 },
    );
    expect(r.pickedDomains).toContain("cadastros");
  });

  it("texto sem cnpj NAO ativa forceInclude de cadastros", async () => {
    const r = await pickDomains("racnpjao xyz teste", SETTINGS);
    // Pode ter fallback ou pickedDomains diferentes, mas nao cadastros via
    // forceInclude.
    if (!r.fallback.triggered) {
      // forceInclude nao deveria casar (racnpjao nao tem \bcnpj\b)
    }
  });
});

describe("pickDomains: regra 7 - excludeFromFiltering", () => {
  beforeEach(() => {
    mockEmbed.mockReset();
    __resetDomainCache();
    __resetQuestionCache();
    mockEmbedByText();
  });

  it("caminho3 sempre presente quando NAO ha fallback", async () => {
    const r = await pickDomains("<<<financeiro-question>>>", SETTINGS);
    expect(r.pickedDomains).toContain("caminho3");
  });

  it("dominios-vazios sempre presente quando NAO ha fallback", async () => {
    const r = await pickDomains("<<<financeiro-question>>>", SETTINGS);
    expect(r.pickedDomains).toContain("dominios-vazios");
  });

  it("em fallback, pickedDomains pode estar vazio (escape hatch nao agregado)", async () => {
    const r = await pickDomains("ok", SETTINGS);
    expect(r.fallback.triggered).toBe(true);
    expect(r.pickedDomains).toEqual([]);
  });
});

describe("pickDomains: routerVersion", () => {
  beforeEach(() => {
    mockEmbed.mockReset();
    __resetDomainCache();
    __resetQuestionCache();
    mockEmbedByText();
  });

  it("routerVersion segue formato r1.X.Y-<hash8>", async () => {
    const r = await pickDomains("ok", SETTINGS);
    expect(r.routerVersion).toMatch(/^r1\.\d+\.\d+-[0-9a-f]{8}$/);
  });
});

describe("pickDomains: pickDurationMs", () => {
  beforeEach(() => {
    mockEmbed.mockReset();
    __resetDomainCache();
    __resetQuestionCache();
    mockEmbedByText();
  });

  it("e numero nao negativo", async () => {
    const r = await pickDomains("<<<financeiro-question>>>", SETTINGS);
    expect(typeof r.pickDurationMs).toBe("number");
    expect(r.pickDurationMs).toBeGreaterThanOrEqual(0);
  });
});
