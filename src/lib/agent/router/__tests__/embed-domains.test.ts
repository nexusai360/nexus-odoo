import { describe, expect, it, beforeEach, jest } from "@jest/globals";

// Mock rag/embed antes do import. Batch: embedAllDomains usa embedMany (1
// chamada para todos os dominios), entao mockamos embedMany.
const mockEmbedMany =
  jest.fn<(texts: string[]) => Promise<number[][]>>();
jest.mock("../../rag/embed", () => ({
  embedMany: (texts: string[]) => mockEmbedMany(texts),
  EmbeddingUnavailable: class extends Error {},
}));

// Import depois do mock para o singleton pegar a versao mockada.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getDomainVectors, __resetDomainCache } = require("../embed-domains") as {
  getDomainVectors: () => Promise<Record<string, number[]>>;
  __resetDomainCache: () => void;
};

const STUB = (n: number): number[] => Array.from({ length: 1536 }, () => n);
/** Implementacao padrao: 1 vetor por texto recebido em lote. */
const batchStub = async (texts: string[]): Promise<number[][]> =>
  texts.map((t) => STUB(t.length % 7));

describe("embed-domains: cache + race safety", () => {
  beforeEach(() => {
    mockEmbedMany.mockReset();
    __resetDomainCache();
    mockEmbedMany.mockImplementation(batchStub);
  });

  it("primeira chamada embeda os 9 dominios em 1 lote", async () => {
    const vectors = await getDomainVectors();
    expect(Object.keys(vectors)).toHaveLength(9);
    expect(mockEmbedMany).toHaveBeenCalledTimes(1);
    expect(mockEmbedMany.mock.calls[0][0]).toHaveLength(9);
  });

  it("segunda chamada usa o cache (zero novas chamadas ao embed)", async () => {
    await getDomainVectors();
    mockEmbedMany.mockClear();
    await getDomainVectors();
    expect(mockEmbedMany).not.toHaveBeenCalled();
  });

  it("chamadas concorrentes em cold start compartilham a mesma promise", async () => {
    const [a, b] = await Promise.all([getDomainVectors(), getDomainVectors()]);
    expect(mockEmbedMany).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("vetores retornados batem com numero de dominios canonicos", async () => {
    const vectors = await getDomainVectors();
    expect(vectors["cadastros"]).toBeDefined();
    expect(vectors["financeiro"]).toBeDefined();
    expect(vectors["fiscal"]).toBeDefined();
    expect(vectors["caminho3"]).toBeDefined();
  });

  it("reset limpa cache (proxima chamada embeda de novo)", async () => {
    await getDomainVectors();
    mockEmbedMany.mockClear();
    __resetDomainCache();
    await getDomainVectors();
    expect(mockEmbedMany).toHaveBeenCalledTimes(1);
  });

  it("propaga erro do embed se cold start falhar", async () => {
    mockEmbedMany.mockReset();
    mockEmbedMany.mockRejectedValueOnce(new Error("api down"));
    await expect(getDomainVectors()).rejects.toThrow("api down");
  });

  it("apos erro, proxima chamada tenta de novo (nao cacheia erro)", async () => {
    mockEmbedMany.mockReset();
    mockEmbedMany.mockRejectedValueOnce(new Error("transient"));
    await expect(getDomainVectors()).rejects.toThrow();
    mockEmbedMany.mockReset();
    mockEmbedMany.mockImplementation(batchStub);
    await expect(getDomainVectors()).resolves.toBeDefined();
    expect(mockEmbedMany).toHaveBeenCalledTimes(1);
  });
});
