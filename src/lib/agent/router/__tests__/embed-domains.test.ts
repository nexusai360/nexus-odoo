import { describe, expect, it, beforeEach, jest } from "@jest/globals";

// Mock rag/embed antes do import.
const mockEmbed = jest.fn<(text: string) => Promise<number[]>>();
jest.mock("../../rag/embed", () => ({
  embed: (t: string) => mockEmbed(t),
  EmbeddingUnavailable: class extends Error {},
}));

// Import depois do mock para o singleton pegar a versao mockada.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getDomainVectors, __resetDomainCache } = require("../embed-domains") as {
  getDomainVectors: () => Promise<Record<string, number[]>>;
  __resetDomainCache: () => void;
};

const STUB = (n: number): number[] => Array.from({ length: 1536 }, () => n);

describe("embed-domains: cache + race safety", () => {
  beforeEach(() => {
    mockEmbed.mockReset();
    __resetDomainCache();
    mockEmbed.mockImplementation(async (text: string) => {
      // Vetor "unique" derivado do tamanho do texto, suficiente para teste.
      return STUB(text.length % 7);
    });
  });

  it("primeira chamada embeda os 9 dominios", async () => {
    const vectors = await getDomainVectors();
    expect(Object.keys(vectors)).toHaveLength(9);
    expect(mockEmbed).toHaveBeenCalledTimes(9);
  });

  it("segunda chamada usa o cache (zero novas chamadas ao embed)", async () => {
    await getDomainVectors();
    mockEmbed.mockClear();
    await getDomainVectors();
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it("chamadas concorrentes em cold start compartilham a mesma promise", async () => {
    const [a, b] = await Promise.all([getDomainVectors(), getDomainVectors()]);
    expect(mockEmbed).toHaveBeenCalledTimes(9);
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
    mockEmbed.mockClear();
    __resetDomainCache();
    await getDomainVectors();
    expect(mockEmbed).toHaveBeenCalledTimes(9);
  });

  it("propaga erro do embed se cold start falhar", async () => {
    mockEmbed.mockReset();
    mockEmbed.mockRejectedValueOnce(new Error("api down"));
    await expect(getDomainVectors()).rejects.toThrow("api down");
  });

  it("apos erro, proxima chamada tenta de novo (nao cacheia erro)", async () => {
    mockEmbed.mockReset();
    mockEmbed.mockRejectedValueOnce(new Error("transient"));
    await expect(getDomainVectors()).rejects.toThrow();
    mockEmbed.mockReset();
    mockEmbed.mockImplementation(async () => STUB(1));
    await expect(getDomainVectors()).resolves.toBeDefined();
    expect(mockEmbed).toHaveBeenCalledTimes(9);
  });
});
