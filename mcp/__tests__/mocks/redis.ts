// mcp/__tests__/mocks/redis.ts
// Factory de mock Redis com ioredis-mock para testes unitários do servidor MCP.
// Retorna instância fresh a cada chamada , sem estado compartilhado entre testes.
// Compatível com RateLimitRedis (pipeline INCR+EXPIRE) e SET NX (Bloco E distributed lock).

import RedisMock from "ioredis-mock";
import type Redis from "ioredis";

export function createMockRedis(): Redis {
  return new RedisMock() as unknown as Redis;
}
