// mcp/lib/rate-limit.ts
// Rate limiter do servidor MCP , 4f-3 / Bloco G.
// Padrão: Redis INCR+EXPIRE (pipeline), janela deslizante de 60s.
//
// Interface mínima do Redis exigida: .pipeline() que retorna um pipeline com
// .incr(key), .expire(key, seconds) e .exec() → Array<[Error|null, number]>.
// Compatível com ioredis e com o mock de teste.
//
// Exports principais:
//   checkMcpRateLimit(redis, userId)          , legado, preservado
//   checkMcpRateLimitFor(redis, scope)        , novo, aceita user | apiKey

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

// Limite por janela. Padrão 60/min; `MCP_RATE_LIMIT` permite ajustar por
// ambiente (ex.: bateria de carga/validação). Produção mantém o padrão.
const LIMIT = Number(process.env.MCP_RATE_LIMIT) || 60;
const WINDOW_SECS = 60; // janela em segundos

/** Mensagem retornada ao cliente quando o rate limit é excedido. */
export const RATE_LIMIT_EXCEEDED_MESSAGE =
  "rate_limit_exceeded: muitas requisições. Tente novamente em instantes.";

/**
 * Verifica o rate limit do MCP para um usuário.
 * Chave Redis: `mcp:rate:{userId}` , janela deslizante de 60s, 60 req/min.
 * INCR+EXPIRE em pipeline atômico (best-effort , não usa MULTI/EXEC).
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
  // Se o INCR falhou (erro parcial de pipeline), logar e permitir a requisição
  // (fail-open deliberado: Redis degradado não bloqueia usuários legítimos).
  const incrError = results?.[0]?.[0];
  if (incrError) {
    console.error("[mcp] rate-limit: erro no INCR do pipeline Redis:", incrError);
  }
  const count: number = results?.[0]?.[1] ?? 1;

  if (count > LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: Math.max(0, LIMIT - count) };
}

// ---------------------------------------------------------------------------
// checkMcpRateLimitFor , novo, Bloco G
// ---------------------------------------------------------------------------

/** Escopo para checkMcpRateLimitFor. */
export type RateLimitScope =
  | { type: "user"; userId: string; limit?: number }
  | { type: "apiKey"; apiKeyId: string; limit: number };

/** Resultado estendido com limite real e resetAt. */
export interface RateLimitResultFull {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
  warning?: "redis_unavailable";
}

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 600;

/**
 * Verifica o rate limit do MCP para um usuário ou API key.
 *
 * Chaves Redis:
 *   - user:   `mcp:rate:user:<userId>`
 *   - apiKey: `mcp:rate:apikey:<apiKeyId>`
 *
 * Janela deslizante de 60s via INCR+EXPIRE (best-effort, não MULTI/EXEC).
 * Fail-open: se Redis estiver indisponível, permite a requisição e inclui
 * `warning: "redis_unavailable"`.
 *
 * O limite efetivo é `Math.min(scope.limit ?? 60, 600)`.
 */
export async function checkMcpRateLimitFor(
  redis: RateLimitRedis,
  scope: RateLimitScope,
): Promise<RateLimitResultFull> {
  const effectiveLimit = Math.min(
    (scope.type === "user" ? (scope.limit ?? DEFAULT_LIMIT) : scope.limit),
    MAX_LIMIT,
  );

  const key =
    scope.type === "user"
      ? `mcp:rate:user:${scope.userId}`
      : `mcp:rate:apikey:${scope.apiKeyId}`;

  // resetAt = agora + 60s (aproximado, janela fixa por chave)
  const resetAt = new Date(Date.now() + WINDOW_SECS * 1000);

  let count = 1;
  let redisUnavailable = false;

  try {
    const pl = redis.pipeline();
    pl.incr(key);
    pl.expire(key, WINDOW_SECS);
    const results = await pl.exec();

    const incrError = results?.[0]?.[0];
    if (incrError) {
      console.error("[mcp] rate-limit-for: erro no INCR do pipeline Redis:", incrError);
      redisUnavailable = true;
    } else {
      count = results?.[0]?.[1] ?? 1;
    }
  } catch (err) {
    console.error("[mcp] rate-limit-for: Redis indisponível (fail-open):", err);
    redisUnavailable = true;
  }

  if (redisUnavailable) {
    return {
      allowed: true,
      remaining: effectiveLimit,
      limit: effectiveLimit,
      resetAt,
      warning: "redis_unavailable",
    };
  }

  const allowed = count <= effectiveLimit;
  const remaining = allowed ? Math.max(0, effectiveLimit - count) : 0;

  return { allowed, remaining, limit: effectiveLimit, resetAt };
}
