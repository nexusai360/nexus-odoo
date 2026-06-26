/**
 * Job DETERMINISTICO de construcao do perfil de interacao por usuario (Onda 1).
 * Roda no worker (SQL puro, SEM claude/OpenAI) , portanto roda EM PRODUCAO, ao vivo.
 *
 * Fluxo: seleciona candidatos elegiveis (piso de historico + conversa nova) -> para cada um,
 * le topic_tags, tool_calls e perguntas (normalizadas via vocabulario fechado) -> buildProfile
 * -> upsert. Spec 4 (camada deterministica) / 13 (Onda 1).
 *
 * A orquestracao e testavel via `rodarProfileAggregateWith` (deps injetadas); o SQL real
 * (`queryCandidateStats`/`queryUserRows`) e coberto pelo E2E (scripts/e2e-user-profile.ts).
 */

import type { PrismaClient } from "@/generated/prisma/client";
import {
  selectEligible,
  type CandidateStat,
} from "@/lib/agent/user-profile/candidates";
import {
  buildProfileFromRows,
  type RawTopicRow,
  type RawToolCallRow,
  type RawQuestionRow,
} from "@/lib/agent/user-profile/build";
import { normalizarPergunta } from "@/lib/agent/user-profile/normalizar-pergunta";
import { upsertUserAgentProfile } from "@/lib/agent/user-profile/store";
import type { UserProfileData } from "@/lib/agent/user-profile/types";

export const LEARNED_MODEL_TAG = "deterministico-v1";

export interface UserRows {
  topics: RawTopicRow[];
  toolCalls: RawToolCallRow[];
  questions: RawQuestionRow[];
  /** Textos crus das mensagens do usuario (p/ detectar verbosidade; nao sao persistidos). */
  userTexts: string[];
}

export interface ProfileAggregateDeps {
  queryCandidateStats: () => Promise<CandidateStat[]>;
  queryUserRows: (userId: string) => Promise<UserRows>;
  upsert: (userId: string, data: UserProfileData) => Promise<void>;
  nowMs: number;
}

/** Orquestracao pura-de-IO (deps injetadas) , o que o teste exercita. */
export async function rodarProfileAggregateWith(
  deps: ProfileAggregateDeps,
): Promise<{ atualizados: number }> {
  const stats = await deps.queryCandidateStats();
  const eligiveis = selectEligible(stats);
  let atualizados = 0;
  for (const userId of eligiveis) {
    const rows = await deps.queryUserRows(userId);
    const profile = buildProfileFromRows({ ...rows, nowMs: deps.nowMs });
    await deps.upsert(userId, profile);
    atualizados++;
  }
  return { atualizados };
}

// ─── SQL real (coberto no E2E) ─────────────────────────────────────────────────

function toMs(v: unknown): number {
  const n = typeof v === "bigint" ? Number(v) : Number(v as number);
  return Number.isFinite(n) ? n : 0;
}

async function queryCandidateStats(p: PrismaClient): Promise<CandidateStat[]> {
  const rows = await p.$queryRawUnsafe<
    { userId: string; conversations: number; messages: number; lastMessageMs: unknown; profileBuiltMs: unknown }[]
  >(`
    SELECT c.user_id AS "userId",
           COUNT(DISTINCT c.id)::int AS "conversations",
           COUNT(m.id)::int AS "messages",
           EXTRACT(EPOCH FROM MAX(m.created_at)) * 1000 AS "lastMessageMs",
           EXTRACT(EPOCH FROM uap.profile_built_at) * 1000 AS "profileBuiltMs"
    FROM conversations c
    JOIN messages m ON m.conversation_id = c.id
    LEFT JOIN user_agent_profiles uap ON uap.user_id = c.user_id
    WHERE c.user_id IS NOT NULL
    GROUP BY c.user_id, uap.profile_built_at
  `);
  return rows.map((r) => ({
    userId: r.userId,
    conversations: Number(r.conversations),
    messages: Number(r.messages),
    lastMessageMs: toMs(r.lastMessageMs),
    profileBuiltMs: r.profileBuiltMs == null ? null : toMs(r.profileBuiltMs),
  }));
}

async function queryUserRows(p: PrismaClient, userId: string): Promise<UserRows> {
  const topicRows = await p.$queryRawUnsafe<{ topic: string; count: number; lastSeenMs: unknown }[]>(
    `
    SELECT topic, COUNT(*)::int AS "count", EXTRACT(EPOCH FROM MAX(c.created_at)) * 1000 AS "lastSeenMs"
    FROM conversations c, unnest(c.topic_tags) AS topic
    WHERE c.user_id = $1::uuid AND array_length(c.topic_tags, 1) > 0
    GROUP BY topic
    `,
    userId,
  );
  const toolRows = await p.$queryRawUnsafe<{ toolName: string; count: number; lastSeenMs: unknown }[]>(
    `
    SELECT tc->>'name' AS "toolName", COUNT(*)::int AS "count",
           EXTRACT(EPOCH FROM MAX(m.created_at)) * 1000 AS "lastSeenMs"
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    CROSS JOIN LATERAL jsonb_array_elements(m.tool_calls) AS tc
    WHERE c.user_id = $1::uuid AND m.tool_calls IS NOT NULL
      AND jsonb_typeof(m.tool_calls) = 'array'
    GROUP BY tc->>'name'
    `,
    userId,
  );
  const msgRows = await p.$queryRawUnsafe<{ content: string; ms: unknown }[]>(
    `
    SELECT m.content AS "content", EXTRACT(EPOCH FROM m.created_at) * 1000 AS "ms"
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.user_id = $1::uuid AND m.role::text = 'user' AND m.content <> ''
    ORDER BY m.created_at DESC
    LIMIT 500
    `,
    userId,
  );

  // perguntas -> rotulo de vocabulario FECHADO (PII-safe), agregadas por label.
  const byLabel = new Map<string, { count: number; lastSeenMs: number }>();
  for (const r of msgRows) {
    const label = normalizarPergunta(r.content);
    if (!label) continue;
    const ms = toMs(r.ms);
    const cur = byLabel.get(label);
    if (cur) {
      cur.count++;
      cur.lastSeenMs = Math.max(cur.lastSeenMs, ms);
    } else {
      byLabel.set(label, { count: 1, lastSeenMs: ms });
    }
  }
  const questions: RawQuestionRow[] = [...byLabel.entries()].map(([label, v]) => ({
    label,
    count: v.count,
    lastSeenMs: v.lastSeenMs,
  }));

  const topics: RawTopicRow[] = topicRows.map((r) => ({
    topic: r.topic,
    count: Number(r.count),
    lastSeenMs: toMs(r.lastSeenMs),
  }));
  const toolCalls: RawToolCallRow[] = toolRows
    .filter((r) => typeof r.toolName === "string" && r.toolName.length > 0)
    .map((r) => ({ toolName: r.toolName, count: Number(r.count), lastSeenMs: toMs(r.lastSeenMs) }));

  return { topics, toolCalls, questions, userTexts: msgRows.map((r) => r.content) };
}

/** Entrada real do job (usada pelo worker). */
export async function rodarProfileAggregate(p: PrismaClient): Promise<{ atualizados: number }> {
  return rodarProfileAggregateWith({
    nowMs: Date.now(),
    queryCandidateStats: () => queryCandidateStats(p),
    queryUserRows: (userId) => queryUserRows(p, userId),
    upsert: (userId, data) => upsertUserAgentProfile(userId, data, { lastLearnedModel: LEARNED_MODEL_TAG }),
  });
}
