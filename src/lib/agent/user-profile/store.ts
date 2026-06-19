/**
 * CRUD do perfil de interacao + cache Redis. Compartilhado entre runtime (src/) e o
 * job do worker (src/worker/). Best-effort no cache (falha -> recomputa/segue).
 *
 * Invalidacao CROSS-CACHE (spec B3): ao gravar o perfil, invalida tanto o cache do perfil
 * (`nex:user-profile:`) quanto o das welcome suggestions (`nex:welcome-suggestions:`), que
 * agora dependem do perfil. Feita por padrao de chave direto no Redis (cobre qualquer versao
 * da key), sem importar o modulo de welcome , evita ciclo e mantem o worker leve.
 */

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import type { UserProfileData, TopTopic, TopKeyword, RecurringQuestion, PresentationPrefs } from "./types";

/** Os campos derivados sao Json no Prisma; cast estreito para o tipo de input. */
function asJson(v: unknown): Prisma.InputJsonValue {
  return v as Prisma.InputJsonValue;
}

export const PROFILE_CACHE_PREFIX = "nex:user-profile:";
export const PROFILE_CACHE_TTL_S = 5 * 60;
const WELCOME_CACHE_PREFIX = "nex:welcome-suggestions:";

function profileKey(userId: string): string {
  return `${PROFILE_CACHE_PREFIX}${userId}:v1`;
}

/** Mapeia uma linha do prisma (campos Json) para UserProfileData. */
function rowToProfile(row: {
  topTopics: unknown;
  topKeywords: unknown;
  preferredDomains: string[];
  recurringQuestions: unknown;
  presentationPrefs: unknown;
}): UserProfileData {
  return {
    topTopics: (row.topTopics as TopTopic[]) ?? [],
    topKeywords: (row.topKeywords as TopKeyword[]) ?? [],
    preferredDomains: row.preferredDomains ?? [],
    recurringQuestions: (row.recurringQuestions as RecurringQuestion[]) ?? [],
    presentationPrefs: (row.presentationPrefs as PresentationPrefs) ?? {},
  };
}

export async function getUserAgentProfile(userId: string): Promise<UserProfileData | null> {
  if (!userId) return null;
  const key = profileKey(userId);
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as UserProfileData;
  } catch {
    // ignore cache error
  }
  let row;
  try {
    row = await prisma.userAgentProfile.findUnique({
      where: { userId },
      select: {
        topTopics: true,
        topKeywords: true,
        preferredDomains: true,
        recurringQuestions: true,
        presentationPrefs: true,
      },
    });
  } catch {
    return null;
  }
  if (!row) return null;
  const profile = rowToProfile(row);
  try {
    await redis.set(key, JSON.stringify(profile), "EX", PROFILE_CACHE_TTL_S);
  } catch {
    // ignore
  }
  return profile;
}

export async function upsertUserAgentProfile(
  userId: string,
  data: UserProfileData,
  meta?: { lastLearnedModel?: string },
): Promise<void> {
  const now = new Date();
  const fields = {
    topTopics: asJson(data.topTopics),
    topKeywords: asJson(data.topKeywords),
    preferredDomains: data.preferredDomains,
    recurringQuestions: asJson(data.recurringQuestions),
    presentationPrefs: asJson(data.presentationPrefs),
    profileBuiltAt: now,
    ...(meta?.lastLearnedModel ? { lastLearnedModel: meta.lastLearnedModel } : {}),
  };
  await prisma.userAgentProfile.upsert({
    where: { userId },
    create: { userId, ...fields },
    update: fields,
  });
  await invalidateUserCaches(userId);
}

export async function resetUserAgentProfile(userId: string): Promise<void> {
  await prisma.userAgentProfile.update({
    where: { userId },
    data: {
      interactionPrompt: null,
      presentationPrefs: asJson({}),
      recurringQuestions: asJson([]),
      topTopics: asJson([]),
      topKeywords: asJson([]),
      preferredDomains: [],
      quarantinedAt: new Date(),
      version: { increment: 1 },
    },
  });
  await invalidateUserCaches(userId);
}

/** Apaga o cache do perfil E o das welcome suggestions do usuario (cross-cache, B3). */
export async function invalidateUserCaches(userId: string): Promise<void> {
  try {
    const profKeys = await redis.keys(`${PROFILE_CACHE_PREFIX}${userId}*`);
    if (profKeys.length > 0) await redis.del(...profKeys);
  } catch {
    // best-effort
  }
  try {
    const welKeys = await redis.keys(`${WELCOME_CACHE_PREFIX}${userId}:*`);
    if (welKeys.length > 0) await redis.del(...welKeys);
  } catch {
    // best-effort
  }
}
