// mcp/lib/__tests__/distributed-lock.test.ts
import { acquireLock, releaseLock } from "../distributed-lock";
import { createMockRedis } from "../../__tests__/mocks/redis";

describe("acquireLock", () => {
  it("retorna true na primeira aquisição", async () => {
    const redis = createMockRedis();
    const result = await acquireLock(redis, "mcp:idem:key1", { ttlSec: 60 });
    expect(result).toBe(true);
  });

  it("retorna false quando lock já existe", async () => {
    const redis = createMockRedis();
    await acquireLock(redis, "mcp:idem:key1", { ttlSec: 60 });
    const second = await acquireLock(redis, "mcp:idem:key1", { ttlSec: 60 });
    expect(second).toBe(false);
  });

  it("keys diferentes → ambos retornam true", async () => {
    const redis = createMockRedis();
    const r1 = await acquireLock(redis, "mcp:idem:keyA", { ttlSec: 60 });
    const r2 = await acquireLock(redis, "mcp:idem:keyB", { ttlSec: 60 });
    expect(r1).toBe(true);
    expect(r2).toBe(true);
  });
});

describe("releaseLock", () => {
  it("libera o lock , acquire volta a ser possível", async () => {
    const redis = createMockRedis();
    await acquireLock(redis, "mcp:idem:key1", { ttlSec: 60 });
    await releaseLock(redis, "mcp:idem:key1");
    const result = await acquireLock(redis, "mcp:idem:key1", { ttlSec: 60 });
    expect(result).toBe(true);
  });

  it("release de key inexistente não lança erro", async () => {
    const redis = createMockRedis();
    await expect(releaseLock(redis, "mcp:idem:nao-existe")).resolves.toBeUndefined();
  });
});
