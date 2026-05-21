// mcp/auth/__tests__/api-key-invalidator.test.ts
import { createMockRedis } from "../../__tests__/mocks/redis";
import { createApiKeyCache } from "../api-key-cache";
import { startApiKeyInvalidator } from "../api-key-invalidator";
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

/** Aguarda até que a condição seja verdadeira, com timeout. */
async function waitFor(
  condition: () => boolean,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const { timeoutMs = 500, intervalMs = 20 } = opts;
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("waitFor timeout");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

describe("startApiKeyInvalidator", () => {
  it("stop() não lança erro", () => {
    const redis = createMockRedis();
    const cache = createApiKeyCache();
    const invalidator = startApiKeyInvalidator(redis, cache);
    expect(() => invalidator.stop()).not.toThrow();
  });

  it("invalida entry do cache ao receber mensagem no canal correto", async () => {
    const redis = createMockRedis();
    const cache = createApiKeyCache({ ttlMs: 60_000, maxSize: 10 });

    // Pré-popula o cache
    const loader = jest.fn().mockResolvedValue(makeCtx("key-id-99"));
    await cache.getOrLoad("hash-99", loader);
    expect(loader).toHaveBeenCalledTimes(1);

    startApiKeyInvalidator(redis, cache);

    // Aguarda psubscribe se registrar (async no ioredis-mock)
    await new Promise((r) => setTimeout(r, 50));

    // Publica mensagem de invalidação no canal
    await redis.publish("mcp:keys:invalidated:key-id-99", "");

    // Aguarda invalidação propagar (event loop do pmessage)
    await new Promise((r) => setTimeout(r, 20));

    // Após invalidação, loader deve ser chamado novamente
    await cache.getOrLoad("hash-99", loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
