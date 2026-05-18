// mcp/lib/rate-limit.ts
// Rate limiter do servidor MCP — 4f-3.
// Padrão: Redis INCR+EXPIRE (pipeline), chave mcp:rate:{userId}, limite 60/min.
//
// Interface mínima do Redis exigida: .pipeline() que retorna um pipeline com
// .incr(key), .expire(key, seconds) e .exec() → Array<[Error|null, number]>.
// Compatível com ioredis e com o mock de teste.

export interface RateLimitPipeline {
  incr(key: string): RateLimitPipeline;
  expire(key: string, seconds: number): RateLimitPipeline;
  exec(): Promise<Array<[Error | null, number]>>;
}

export interface RateLimitRedis {
  pipeline(): RateLimitPipeline;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

const LIMIT = 60;       // requisições por janela
const WINDOW_SECS = 60; // janela em segundos

/**
 * Verifica o rate limit do MCP para um usuário.
 * Chave Redis: `mcp:rate:{userId}` — janela deslizante de 60s, 60 req/min.
 * INCR+EXPIRE em pipeline atômico (best-effort — não usa MULTI/EXEC).
 *
 * Retorna `{ allowed: false, remaining: 0 }` na 61ª chamada ou além.
 */
export async function checkMcpRateLimit(
  redis: RateLimitRedis,
  userId: string,
): Promise<RateLimitResult> {
  const key = `mcp:rate:${userId}`;

  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.expire(key, WINDOW_SECS);
  const results = await pipeline.exec();

  // results[0] = [error, count]
  const count: number = results?.[0]?.[1] ?? 1;

  if (count > LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: Math.max(0, LIMIT - count) };
}
