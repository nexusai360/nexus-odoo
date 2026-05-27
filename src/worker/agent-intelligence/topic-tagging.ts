/**
 * Processor do job `agent-topic-tagging`.
 *
 * Idempotencia: re-roda quando ha >= 10 mensagens novas do user desde o
 * ultimo tagging (`Conversation.topicTagsAt`). Mensagens sao append-mescladas;
 * cap 5 tags por conversa.
 *
 * Conversao canonica (extractTopics -> topicTags):
 *   tag0 = "${domain}:${topic}" se domain != topic; senao "${topic}"
 *   + keywords prefixadas como "keyword:${k}"
 *
 * Spec: docs/superpowers/specs/2026-05-25-agente-nex-inteligencia-design.md §4
 */

import { prisma } from "@/lib/prisma";
import { extractTopics } from "@/lib/agent/intelligence/topic-extractor";

const RETAG_THRESHOLD_NEW_MESSAGES = 10;
const MAX_TAGS = 5;
const MAX_USER_MESSAGES_FOR_EXTRACTION = 5;

export async function processTopicTaggingJob(data: {
  conversationId: string;
}): Promise<{ ok: true; skipped?: boolean; tags?: string[] }> {
  const { conversationId } = data;

  // Carrega estado atual da conversa.
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      topicTags: true,
      topicTagsAt: true,
    },
  });
  if (!conv) {
    console.warn("[topic-tagging] conversa nao encontrada:", conversationId);
    return { ok: true, skipped: true };
  }

  // Idempotencia: se ja tem tagging e ha < N msgs novas, pula.
  if (conv.topicTagsAt) {
    const newMessages = await prisma.message.count({
      where: {
        conversationId,
        role: "user",
        createdAt: { gt: conv.topicTagsAt },
      },
    });
    if (newMessages < RETAG_THRESHOLD_NEW_MESSAGES) {
      return { ok: true, skipped: true };
    }
  }

  // Carrega ate as ultimas N msgs do user para classificacao.
  const userMessages = await prisma.message.findMany({
    where: { conversationId, role: "user" },
    orderBy: { createdAt: "desc" },
    take: MAX_USER_MESSAGES_FOR_EXTRACTION,
    select: { content: true },
  });
  if (userMessages.length === 0) {
    return { ok: true, skipped: true };
  }

  const result = await extractTopics(userMessages.map((m) => m.content));

  // Conversao canonica em string[] para Conversation.topicTags.
  const tag0 =
    result.domain && result.domain !== result.topic && result.domain !== "outros"
      ? `${result.domain}:${result.topic}`
      : result.topic;
  const kwTags = result.keywords.slice(0, 4).map((k) => `keyword:${k}`);

  const merged = dedupCaseInsensitive([
    ...(conv.topicTags ?? []),
    tag0,
    ...kwTags,
  ]).slice(0, MAX_TAGS);

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      topicTags: merged,
      topicTagsVersion: 1,
      topicTagsAt: new Date(),
    },
  });

  return { ok: true, tags: merged };
}

function dedupCaseInsensitive(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}
