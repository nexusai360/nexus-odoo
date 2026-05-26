/**
 * Helpers para enfileirar jobs da inteligencia do Agente Nex.
 *
 * Padrao do projeto: BullMQ Queue lazy-singleton no processo Next.js, com
 * conexao Redis dedicada (lazyConnect). O worker (processo separado) tem
 * sua propria instancia da Queue para registrar o Worker BullMQ.
 *
 * Best-effort: falhas (Redis off, queue indisponivel, etc.) sao logadas mas
 * nao quebram o caminho critico do agente.
 */

// Sem 'server-only' — este modulo e importado pelo run-agent.ts que tambem
// roda em scripts tsx (auditoria de qualidade). server-only quebra Node puro.

import { Queue } from "bullmq";
import IORedis from "ioredis";

const TOPIC_TAGGING_QUEUE_NAME = "agent-topic-tagging";

let topicTaggingQueue: Queue<{ conversationId: string }> | null = null;

function getTopicTaggingQueue(): Queue<{ conversationId: string }> {
  if (!topicTaggingQueue) {
    const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
    const connection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    topicTaggingQueue = new Queue<{ conversationId: string }>(
      TOPIC_TAGGING_QUEUE_NAME,
      { connection },
    );
  }
  return topicTaggingQueue;
}

/**
 * Enfileira tagging assincrono de uma conversa. Idempotente via `jobId`
 * baseado em `conversationId + messageCount` — BullMQ deduplica.
 *
 * Best-effort: erros sao logados; nunca lanca.
 *
 * @param conversationId  ID da conversa.
 * @param messageCount    Numero atual de mensagens (usado no jobId para
 *                        permitir re-tag em milestones).
 */
export async function enqueueTopicTagging(
  conversationId: string,
  messageCount: number,
): Promise<void> {
  try {
    const queue = getTopicTaggingQueue();
    // jobId pode ter `:` (lesson 2026-05-25 — restricao e apenas para queue NAME).
    const jobId = `topic-tag:${conversationId}:${Math.floor(messageCount / 10)}`;
    await queue.add(
      "topic-tag",
      { conversationId },
      { jobId, removeOnComplete: 100, removeOnFail: 50 },
    );
  } catch (err) {
    console.warn("[enqueueTopicTagging] falha:", err);
  }
}
