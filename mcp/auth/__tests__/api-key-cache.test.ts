// mcp/auth/__tests__/api-key-cache.test.ts
import { createApiKeyCache } from "../api-key-cache";
import type { ApiKeyContext } from "../api-key-context";

const makeCtx = (id: string): ApiKeyContext => ({
  apiKeyId: id,
  label: "test",
  last4: "AbCd",
  capabilities: { version: 1, read: [], write: {} },
  capabilitiesVersion: 1,
  rateLimit: 60,
  tenantId: null,
  allowedOrigins: [],
  isSystemKey: false,
});

describe("createApiKeyCache", () => {
  it("carrega via loader na primeira chamada", async () => {
    const cache = createApiKeyCache({ ttlMs: 60_000, maxSize: 10 });
    const loader = jest.fn().mockResolvedValue(makeCtx("id-1"));

    const result = await cache.getOrLoad("hash-1", loader);
    expect(result?.apiKeyId).toBe("id-1");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("usa cache na segunda chamada , loader não invocado", async () => {
    const cache = createApiKeyCache({ ttlMs: 60_000, maxSize: 10 });
    const loader = jest.fn().mockResolvedValue(makeCtx("id-2"));

    await cache.getOrLoad("hash-2", loader);
    const result2 = await cache.getOrLoad("hash-2", loader);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(result2?.apiKeyId).toBe("id-2");
  });

  it("retorna null e não armazena quando loader retorna null", async () => {
    const cache = createApiKeyCache({ ttlMs: 60_000, maxSize: 10 });
    const loader = jest.fn().mockResolvedValue(null);

    const r1 = await cache.getOrLoad("hash-null", loader);
    const r2 = await cache.getOrLoad("hash-null", loader);
    expect(r1).toBeNull();
    expect(r2).toBeNull();
    // loader invocado nas duas vezes pois null não é cacheado
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("invalidate(keyHash) força reload", async () => {
    const cache = createApiKeyCache({ ttlMs: 60_000, maxSize: 10 });
    const loader = jest.fn().mockResolvedValue(makeCtx("id-3"));

    await cache.getOrLoad("hash-3", loader);
    cache.invalidate("hash-3");
    await cache.getOrLoad("hash-3", loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("invalidateByApiKeyId remove entrada por ID", async () => {
    const cache = createApiKeyCache({ ttlMs: 60_000, maxSize: 10 });
    const loader = jest.fn().mockResolvedValue(makeCtx("id-4"));

    await cache.getOrLoad("hash-4", loader);
    cache.invalidateByApiKeyId("id-4");
    await cache.getOrLoad("hash-4", loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("invalidate de hash inexistente não lança erro", () => {
    const cache = createApiKeyCache();
    expect(() => cache.invalidate("nonexistent")).not.toThrow();
  });

  it("invalidateByApiKeyId de ID inexistente não lança erro", () => {
    const cache = createApiKeyCache();
    expect(() => cache.invalidateByApiKeyId("nonexistent")).not.toThrow();
  });

  it("entradas distintas são independentes", async () => {
    const cache = createApiKeyCache({ ttlMs: 60_000, maxSize: 10 });
    const loaderA = jest.fn().mockResolvedValue(makeCtx("id-a"));
    const loaderB = jest.fn().mockResolvedValue(makeCtx("id-b"));

    await cache.getOrLoad("hash-a", loaderA);
    await cache.getOrLoad("hash-b", loaderB);
    cache.invalidate("hash-a");

    // hash-b ainda no cache
    const rb = await cache.getOrLoad("hash-b", loaderB);
    expect(rb?.apiKeyId).toBe("id-b");
    expect(loaderB).toHaveBeenCalledTimes(1);
  });
});
