// mcp/lib/rate-limit-headers.test.ts
// TDD — Bloco G, G2

import { rateLimitHeaders } from "./rate-limit-headers.js";

describe("rateLimitHeaders", () => {
  const fixedResetAt = new Date("2026-06-01T00:01:00.000Z"); // 1748736060s

  it("retorna X-RateLimit-Limit como string do limite informado", () => {
    const headers = rateLimitHeaders({ limit: 60, remaining: 59, resetAt: fixedResetAt });
    expect(headers["X-RateLimit-Limit"]).toBe("60");
  });

  it("retorna X-RateLimit-Remaining como string dos remaining informados", () => {
    const headers = rateLimitHeaders({ limit: 60, remaining: 23, resetAt: fixedResetAt });
    expect(headers["X-RateLimit-Remaining"]).toBe("23");
  });

  it("retorna X-RateLimit-Reset como Unix timestamp em segundos (string)", () => {
    const headers = rateLimitHeaders({ limit: 60, remaining: 0, resetAt: fixedResetAt });
    const expected = String(Math.floor(fixedResetAt.getTime() / 1000));
    expect(headers["X-RateLimit-Reset"]).toBe(expected);
  });

  it("garante remaining mínimo de 0 mesmo se passado negativo", () => {
    const headers = rateLimitHeaders({ limit: 60, remaining: -5, resetAt: fixedResetAt });
    expect(headers["X-RateLimit-Remaining"]).toBe("0");
  });

  it("funciona com limite alto (apiKey = 600)", () => {
    const headers = rateLimitHeaders({ limit: 600, remaining: 550, resetAt: fixedResetAt });
    expect(headers["X-RateLimit-Limit"]).toBe("600");
    expect(headers["X-RateLimit-Remaining"]).toBe("550");
  });

  it("retorna todas as três chaves esperadas", () => {
    const headers = rateLimitHeaders({ limit: 60, remaining: 10, resetAt: fixedResetAt });
    expect(Object.keys(headers)).toEqual(
      expect.arrayContaining([
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
      ]),
    );
  });
});
