import { getUsdBrlRate, RATE_SPREAD, __resetUsdBrlCache } from "./exchange-rate";

// Mock do fetch global
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  __resetUsdBrlCache();
  mockFetch.mockReset();
});

describe("getUsdBrlRate", () => {
  test("sucesso: retorna rate, spread e stale=false", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ USDBRL: { bid: "5.5" } }),
    } as Response);

    const result = await getUsdBrlRate();

    expect(result.stale).toBe(false);
    expect(result.spread).toBe(RATE_SPREAD);
    expect(result.rate).toBeCloseTo(5.5 * RATE_SPREAD, 4);
  });

  test("memo válido: retorna resultado em cache sem chamar fetch", async () => {
    // Primeira chamada bem-sucedida — popula memo
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ USDBRL: { bid: "5.2" } }),
    } as Response);
    const first = await getUsdBrlRate();
    expect(first.stale).toBe(false);

    // Segunda chamada sem reset — deve retornar do memo (fetch não chamado)
    const second = await getUsdBrlRate();
    expect(second.stale).toBe(false);
    expect(second.rate).toBe(first.rate);
    // fetch foi chamado apenas 1 vez
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("stale=true quando fetch falha e não há cache in-process", async () => {
    // Sem cache algum + fetch falha → usa fallback com stale=true
    mockFetch.mockRejectedValueOnce(new Error("network error"));

    const result = await getUsdBrlRate();
    expect(result.stale).toBe(true);
    expect(result.rate).toBeGreaterThan(0); // fallback nunca retorna null (BUG 5)
    expect(result.spread).toBe(RATE_SPREAD);
  });

  test("spread retornado é sempre RATE_SPREAD (BUG 6 corrigido)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ USDBRL: { bid: "5.0" } }),
    } as Response);

    const result = await getUsdBrlRate();
    expect(result.spread).toBe(RATE_SPREAD);
  });

  test("nunca retorna null em falha — usa fallback (BUG 5 corrigido)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("timeout"));

    const result = await getUsdBrlRate();
    expect(result).not.toBeNull();
    expect(result.rate).toBeGreaterThan(0);
  });
});
