/**
 * Entrada server-side do modulo de sugestoes personalizadas. Orquestra
 * agregacao + selecao + cache Redis. Idempotente e seguro de chamar em
 * server components (layout) ou server actions.
 *
 * Falhas (DB lento, Redis off, query vazia) retornam array vazio para o
 * caller cair no fallback curado (`WELCOME_SUGGESTIONS`).
 */

import "server-only";

import type { ReportDomain } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { aggregateToolUsage } from "./aggregate";
import { pickPersonalizedQuestions } from "./pick";

const RECENT_WINDOW_DAYS = 28;
const CACHE_TTL_SECONDS = 5 * 60;

function cacheKey(userId: string, max: number, domainsTag: string): string {
  // v3 (2026-06-02): inclui dominios permitidos para o cache respeitar o
  // filtro por dominio da tool. v2 era so userId+max.
  return `nex:welcome-suggestions:${userId}:v3:${max}:${domainsTag}`;
}

export async function getPersonalizedWelcomeSuggestions(
  userId: string | null | undefined,
  maxSuggestions: number,
  allowedDomains?: ReportDomain[],
): Promise<string[]> {
  if (!userId) return [];
  const safeMax = Math.min(Math.max(1, maxSuggestions || 3), 5);

  const domainsTag = allowedDomains
    ? [...allowedDomains].sort().join(",") || "none"
    : "all";
  const key = cacheKey(userId, safeMax, domainsTag);

  // Try cache first (best effort).
  try {
    const cached = await redis.get(key);
    if (cached) {
      const parsed = JSON.parse(cached) as unknown;
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
        return parsed as string[];
      }
    }
  } catch {
    // ignore cache miss/error; recompute
  }

  try {
    const [allTime, recent] = await Promise.all([
      aggregateToolUsage(prisma, userId, null),
      aggregateToolUsage(prisma, userId, RECENT_WINDOW_DAYS),
    ]);
    const out = pickPersonalizedQuestions(allTime, recent, safeMax, allowedDomains);

    try {
      await redis.set(key, JSON.stringify(out), "EX", CACHE_TTL_SECONDS);
    } catch {
      // ignore set error
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Invalida o cache de sugestoes do usuario. Chamado quando um novo turno do
 * agente termina (assistant mensagem com tool_calls foi persistida) para
 * que a proxima abertura da bubble reflita o uso mais recente.
 */
export async function invalidatePersonalizedWelcomeCache(
  userId: string | null | undefined,
): Promise<void> {
  if (!userId) return;
  // Limpa todas as variantes (max e dominios) do usuario sem precisar saber
  // quais estao ativas. Best-effort: keyspace por usuario e pequeno.
  try {
    const keys = await redis.keys(`nex:welcome-suggestions:${userId}:v3:*`);
    if (keys.length > 0) await redis.del(...keys);
  } catch {
    // best-effort
  }
}
