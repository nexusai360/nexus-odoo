/**
 * Definicao da fila BullMQ `agent-topic-tagging` (Onda 1 da Inteligencia).
 *
 * Tagging assincrono de topicos por conversa, fora do caminho critico do chat.
 * Spec: docs/superpowers/specs/2026-05-25-agente-nex-inteligencia-design.md §4
 *
 * REGRA: queue names sem `:` (lesson 2026-05-25 15:45 , BullMQ >= 5 proibe).
 */

export const AGENT_TOPIC_TAGGING_QUEUE = "agent-topic-tagging";
export const AGENT_PROFILE_BUILD_QUEUE = "agent-profile-build";
export const AGENT_INTELLIGENCE_CLEANUP_QUEUE = "agent-intelligence-cleanup";

export type TopicTaggingJobData = {
  conversationId: string;
};

export type ProfileBuildJobData = {
  userId: string;
};
