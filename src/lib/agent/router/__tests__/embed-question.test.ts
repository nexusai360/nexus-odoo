import { describe, expect, it, beforeEach, jest } from "@jest/globals";

const mockEmbed = jest.fn<(text: string) => Promise<number[]>>();
jest.mock("../../rag/embed", () => ({
  embed: (t: string) => mockEmbed(t),
  EmbeddingUnavailable: class extends Error {},
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const embedQuestionModule = require("../embed-question") as {
  embedQuestion: (q: string) => Promise<{ vector: number[]; cacheHit: boolean }>;
  __resetQuestionCache: () => void;
  getQuestionCacheSize: () => number;
  getQuestionCacheCapacity: () => number;
};
const {
  embedQuestion,
  __resetQuestionCache,
  getQuestionCacheSize,
  getQuestionCacheCapacity,
} = embedQuestionModule;

const STUB_VEC = (n: number): number[] => Array.from({ length: 8 }, () => n);

describe("embed-question: LRU 200 entradas", () => {
  beforeEach(() => {
    mockEmbed.mockReset();
    __resetQuestionCache();
    let counter = 0;
    mockEmbed.mockImplementation(async () => STUB_VEC(++counter));
  });

  it("capacidade configurada e 200", () => {
    expect(getQuestionCacheCapacity()).toBe(200);
  });

  it("primeira chamada e cache miss", async () => {
    const r = await embedQuestion("qual o saldo?");
    expect(r.cacheHit).toBe(false);
    expect(mockEmbed).toHaveBeenCalledTimes(1);
  });

  it("mesma pergunta gera cache hit", async () => {
    await embedQuestion("qual o saldo?");
    const r = await embedQuestion("qual o saldo?");
    expect(r.cacheHit).toBe(true);
    expect(mockEmbed).toHaveBeenCalledTimes(1);
  });

  it("perguntas diferentes geram entradas distintas", async () => {
    await embedQuestion("qual o saldo?");
    await embedQuestion("quanto temos a receber?");
    expect(mockEmbed).toHaveBeenCalledTimes(2);
    expect(getQuestionCacheSize()).toBe(2);
  });

  it("normalize: variacoes da mesma pergunta batem no cache", async () => {
    await embedQuestion("Qual o Saldo?");
    const r = await embedQuestion("  qual o saldo?  ");
    expect(r.cacheHit).toBe(true);
    expect(mockEmbed).toHaveBeenCalledTimes(1);
  });

  it("normalize: trim+lowercase iguala chave", async () => {
    await embedQuestion("Faturamento de Maio");
    const r = await embedQuestion("faturamento de maio");
    expect(r.cacheHit).toBe(true);
  });

  it("vetor retornado e o esperado", async () => {
    const r = await embedQuestion("teste");
    expect(r.vector).toEqual(STUB_VEC(1));
  });

  it("LRU: ao estourar capacidade, ejeta entrada mais antiga", async () => {
    // Insere CAP+1 entradas; primeira deve ser ejetada.
    const CAP = getQuestionCacheCapacity();
    for (let i = 0; i < CAP + 1; i++) {
      await embedQuestion(`pergunta numero ${i}`);
    }
    expect(getQuestionCacheSize()).toBe(CAP);
    // Pergunta 0 (a primeira) deveria ter saido.
    mockEmbed.mockClear();
    const r = await embedQuestion("pergunta numero 0");
    expect(r.cacheHit).toBe(false);
  });

  it("LRU: get reorganiza ordem (entrada acessada nao e ejetada)", async () => {
    // Insere 2 entradas, acessa a primeira, insere muitas outras ate
    // ejetar; a primeira ainda deve estar la.
    await embedQuestion("alpha");
    await embedQuestion("beta");
    await embedQuestion("alpha"); // hit, recoloca no topo
    const CAP = getQuestionCacheCapacity();
    for (let i = 0; i < CAP - 1; i++) {
      await embedQuestion(`extra ${i}`);
    }
    mockEmbed.mockClear();
    const r = await embedQuestion("alpha");
    expect(r.cacheHit).toBe(true);
  });

  it("reset limpa cache", async () => {
    await embedQuestion("teste");
    __resetQuestionCache();
    expect(getQuestionCacheSize()).toBe(0);
    const r = await embedQuestion("teste");
    expect(r.cacheHit).toBe(false);
  });

  it("propaga erro do embed (cache nao guarda erro)", async () => {
    mockEmbed.mockReset();
    mockEmbed.mockRejectedValueOnce(new Error("oops"));
    await expect(embedQuestion("ola")).rejects.toThrow("oops");
    expect(getQuestionCacheSize()).toBe(0);
  });

  it("pergunta vazia ainda chama embed (regra 1 trata trivial em outro lugar)", async () => {
    await embedQuestion("");
    expect(mockEmbed).toHaveBeenCalledTimes(1);
  });
});
