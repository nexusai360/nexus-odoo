// mcp/lib/rate-limit.test.ts
// TDD — 4f-3 Step 1
// Testa checkMcpRateLimit: chave mcp:rate:{userId}, INCR+EXPIRE 60s, limite 60.
// A 61ª chamada deve retornar bloqueado.

import { checkMcpRateLimit } from "./rate-limit.js";

// Mock Redis mínimo com suporte a INCR + EXPIRE via pipeline
function makeRedisMock(overrides?: { incrValue?: number }) {
  const store: Record<string, number> = {};
  const incrValue = overrides?.incrValue ?? 1;

  return {
    _store: store,
    pipeline: jest.fn().mockReturnValue({
      incr: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        [null, incrValue],  // resultado do INCR
        [null, 1],          // resultado do EXPIRE
      ]),
    }),
  };
}

describe("checkMcpRateLimit", () => {
  it("retorna allowed=true para a primeira chamada (count=1)", async () => {
    const redis = makeRedisMock({ incrValue: 1 }) as unknown as Parameters<typeof checkMcpRateLimit>[0];
    const result = await checkMcpRateLimit(redis, "user-abc");

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(59);
  });

  it("usa a chave mcp:rate:{userId}", async () => {
    const redis = makeRedisMock({ incrValue: 1 }) as unknown as Parameters<typeof checkMcpRateLimit>[0];
    const pipeline = redis.pipeline();
    await checkMcpRateLimit(redis, "user-xyz");

    // Verifica que pipeline foi chamado e incr foi chamado com a chave correta
    expect(redis.pipeline).toHaveBeenCalled();
    expect(pipeline.incr).toHaveBeenCalledWith("mcp:rate:user-xyz");
    expect(pipeline.expire).toHaveBeenCalledWith("mcp:rate:user-xyz", 60);
  });

  it("retorna allowed=true para a 60ª chamada (count=60)", async () => {
    const redis = makeRedisMock({ incrValue: 60 }) as unknown as Parameters<typeof checkMcpRateLimit>[0];
    const result = await checkMcpRateLimit(redis, "user-60");

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("retorna allowed=false para a 61ª chamada (count=61) — rate limit atingido", async () => {
    const redis = makeRedisMock({ incrValue: 61 }) as unknown as Parameters<typeof checkMcpRateLimit>[0];
    const result = await checkMcpRateLimit(redis, "user-blocked");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("retorna allowed=false para contagens acima de 61 (burst protection)", async () => {
    const redis = makeRedisMock({ incrValue: 100 }) as unknown as Parameters<typeof checkMcpRateLimit>[0];
    const result = await checkMcpRateLimit(redis, "user-burst");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});
