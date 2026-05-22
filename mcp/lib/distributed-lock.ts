// mcp/lib/distributed-lock.ts
// Lock distribuído via Redis SET NX EX (ioredis v5 syntax).
// acquireLock → true se conseguiu o lock, false se já existe.
// releaseLock → DEL simples (best-effort; o TTL garante expiração automática).

import type Redis from "ioredis";

export async function acquireLock(
  redis: Redis,
  key: string,
  opts: { ttlSec: number },
): Promise<boolean> {
  // ioredis v5: set(key, value, expiryMode, time, setMode)
  const result = await redis.set(key, "1", "EX", opts.ttlSec, "NX");
  return result === "OK";
}

export async function releaseLock(redis: Redis, key: string): Promise<void> {
  await redis.del(key);
}
