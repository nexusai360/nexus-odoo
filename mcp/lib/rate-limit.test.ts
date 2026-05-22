// mcp/lib/rate-limit.test.ts
// TDD — 4f-3 Step 1
// Testa checkMcpRateLimit: chave mcp:rate:{userId}, INCR+EXPIRE 60s, limite 60.
// A 61ª chamada deve retornar bloqueado.

import { checkMcpRateLimit, checkMcpRateLimitFor, RateLimitRedis } from "./rate-limit.js";

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

// ---------------------------------------------------------------------------
// checkMcpRateLimitFor
// ---------------------------------------------------------------------------

function makeRedisMockFor(overrides?: {
  incrValue?: number;
  incrError?: Error;
  throwOnExec?: boolean;
}) {
  const incrValue = overrides?.incrValue ?? 1;
  const incrError = overrides?.incrError ?? null;
  const throwOnExec = overrides?.throwOnExec ?? false;

  const execMock = throwOnExec
    ? jest.fn().mockRejectedValue(new Error("Redis connection refused"))
    : jest.fn().mockResolvedValue([
        [incrError, incrError ? undefined : incrValue],
        [null, 1],
      ]);

  const incrMock = jest.fn().mockReturnThis();
  const expireMock = jest.fn().mockReturnThis();
  const pipelineMock = jest.fn().mockReturnValue({
    incr: incrMock,
    expire: expireMock,
    exec: execMock,
  });

  return {
    pipeline: pipelineMock,
  } as unknown as RateLimitRedis;
}

describe("checkMcpRateLimitFor — scope user", () => {
  it("retorna allowed=true para count=1 com limite padrão (60)", async () => {
    const redis = makeRedisMockFor({ incrValue: 1 });
    const result = await checkMcpRateLimitFor(redis, { type: "user", userId: "u1" });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(59);
    expect(result.limit).toBe(60);
    expect(result.resetAt).toBeInstanceOf(Date);
    expect(result.warning).toBeUndefined();
  });

  it("usa chave Redis mcp:rate:user:<userId>", async () => {
    const redis = makeRedisMockFor({ incrValue: 1 });
    const pl = redis.pipeline();
    await checkMcpRateLimitFor(redis, { type: "user", userId: "user-123" });

    expect(pl.incr).toHaveBeenCalledWith("mcp:rate:user:user-123");
    expect(pl.expire).toHaveBeenCalledWith("mcp:rate:user:user-123", 60);
  });

  it("respeita limit customizado no scope", async () => {
    const redis = makeRedisMockFor({ incrValue: 30 });
    const result = await checkMcpRateLimitFor(redis, { type: "user", userId: "u2", limit: 50 });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(20);
    expect(result.limit).toBe(50);
  });

  it("clipa limit acima de 600 para 600", async () => {
    const redis = makeRedisMockFor({ incrValue: 1 });
    const result = await checkMcpRateLimitFor(redis, { type: "user", userId: "u3", limit: 9999 });

    expect(result.limit).toBe(600);
  });

  it("retorna allowed=false quando count > limit", async () => {
    const redis = makeRedisMockFor({ incrValue: 61 });
    const result = await checkMcpRateLimitFor(redis, { type: "user", userId: "u4" });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.limit).toBe(60);
  });
});

describe("checkMcpRateLimitFor — scope apiKey", () => {
  it("usa chave Redis mcp:rate:apikey:<apiKeyId>", async () => {
    const redis = makeRedisMockFor({ incrValue: 1 });
    const pl = redis.pipeline();
    await checkMcpRateLimitFor(redis, { type: "apiKey", apiKeyId: "key-abc", limit: 100 });

    expect(pl.incr).toHaveBeenCalledWith("mcp:rate:apikey:key-abc");
    expect(pl.expire).toHaveBeenCalledWith("mcp:rate:apikey:key-abc", 60);
  });

  it("retorna allowed=true para count dentro do limite", async () => {
    const redis = makeRedisMockFor({ incrValue: 50 });
    const result = await checkMcpRateLimitFor(redis, { type: "apiKey", apiKeyId: "k1", limit: 100 });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(50);
    expect(result.limit).toBe(100);
  });

  it("retorna allowed=false quando count > limit", async () => {
    const redis = makeRedisMockFor({ incrValue: 101 });
    const result = await checkMcpRateLimitFor(redis, { type: "apiKey", apiKeyId: "k2", limit: 100 });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

describe("checkMcpRateLimitFor — fail-open (Redis indisponível)", () => {
  it("permite a requisição quando pipeline.exec() lança exceção", async () => {
    const redis = makeRedisMockFor({ throwOnExec: true });
    const result = await checkMcpRateLimitFor(redis, { type: "user", userId: "u-fail" });

    expect(result.allowed).toBe(true);
    expect(result.warning).toBe("redis_unavailable");
    expect(result.remaining).toBe(result.limit);
  });

  it("permite a requisição quando INCR retorna erro parcial de pipeline", async () => {
    const redis = makeRedisMockFor({ incrError: new Error("INCR failed") });
    const result = await checkMcpRateLimitFor(redis, { type: "user", userId: "u-incr-err" });

    expect(result.allowed).toBe(true);
    expect(result.warning).toBe("redis_unavailable");
  });
});
