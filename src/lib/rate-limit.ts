import { redis } from "@/lib/redis";

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 60;
const LOCKOUT_SECONDS = 15 * 60;

/**
 * Rate limit genérico por chave arbitrária.
 * Retorna `allowed: false` quando o limite for atingido.
 *
 * @param key        Chave única (ex: "whatsapp_inbound:ip:1.2.3.4")
 * @param maxHits    Máximo de hits permitidos na janela
 * @param windowSec  Tamanho da janela em segundos
 */
export async function checkRateLimit(
  key: string,
  maxHits: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const attemptsKey = `ratelimit:${key}`;

  const multi = redis.multi();
  multi.incr(attemptsKey);
  multi.expire(attemptsKey, windowSec);
  const results = await multi.exec();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hits = (results as any)?.[0]?.[1] as number ?? 1;
  const remaining = Math.max(0, maxHits - hits);

  if (hits > maxHits) {
    return { allowed: false, remaining: 0, retryAfterSeconds: windowSec };
  }

  return { allowed: true, remaining };
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
}

function buildKeys(email: string, ip: string) {
  const normalized = email.toLowerCase().trim();
  const suffix = `${normalized}:${ip}`;
  return {
    attempts: `login:attempts:${suffix}`,
    lockout: `login:lockout:${suffix}`,
  };
}

export async function checkLoginRateLimit(
  email: string,
  ip: string,
): Promise<RateLimitResult> {
  const keys = buildKeys(email, ip);

  const isLocked = await redis.get(keys.lockout);
  if (isLocked) {
    const ttl = await redis.ttl(keys.lockout);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: ttl > 0 ? ttl : LOCKOUT_SECONDS,
    };
  }

  const multi = redis.multi();
  multi.incr(keys.attempts);
  multi.expire(keys.attempts, WINDOW_SECONDS);
  const results = await multi.exec();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attempts = (results as any)?.[0]?.[1] as number ?? 1;
  const remaining = Math.max(0, MAX_ATTEMPTS - attempts);

  if (attempts >= MAX_ATTEMPTS) {
    await redis.set(keys.lockout, "1", "EX", LOCKOUT_SECONDS);
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining };
}

export async function clearLoginRateLimit(
  email: string,
  ip: string,
): Promise<void> {
  const keys = buildKeys(email, ip);
  await redis.del(keys.attempts, keys.lockout);
}
