/**
 * Persistência e agrupamento de conversas do agente nexus-odoo.
 *
 * Regras de agrupamento (SPEC §9.1):
 * - WhatsApp: reutiliza conversa com última msg < 24h; senão cria nova.
 * - In-app / playground: cada sessão de UI cria uma conversa nova (via createConversation).
 *
 * Usa Prisma v7 + models Conversation e Message da F5 (Task 1.1).
 */

import { prisma } from "@/lib/prisma";
import type { AgentChannel, MessageRole } from "@/generated/prisma/client";
import type { ToolCall } from "./llm/types";

/** 24 horas em ms — janela de reutilização de conversa WhatsApp. */
const WHATSAPP_REUSE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Quantidade padrão de mensagens carregadas no histórico. */
const DEFAULT_HISTORY_BUDGET = 20;

export interface ConversationRecord {
  id: string;
  userId: string;
  channel: AgentChannel;
  updatedAt: Date;
}

export interface HistoryMessage {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls: ToolCall[] | null;
}

/**
 * Deriva um título curto (≤60 chars) da primeira mensagem do usuário.
 * Usado para preencher Conversation.title ao criar.
 */
export function deriveTitle(firstUserMessage: string): string {
  const trimmed = firstUserMessage.trim();
  if (!trimmed) return "Nova conversa";
  if (trimmed.length <= 60) return trimmed;
  return `${trimmed.slice(0, 60)}...`;
}

/**
 * Retorna a conversa WhatsApp ativa (última msg < 24h) ou cria uma nova.
 * Semântica de canal: uma conversa por janela de 24h para WhatsApp.
 */
export async function getOrCreateWhatsappConversation(
  userId: string,
): Promise<ConversationRecord> {
  const cutoff = new Date(Date.now() - WHATSAPP_REUSE_WINDOW_MS);

  const existing = await prisma.conversation.findFirst({
    where: {
      userId,
      channel: "whatsapp",
      updatedAt: { gte: cutoff },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (existing) {
    return existing as ConversationRecord;
  }

  return createConversation(userId, "whatsapp");
}

/**
 * Cria uma nova conversa para o usuário no canal especificado.
 */
export async function createConversation(
  userId: string,
  channel: AgentChannel,
): Promise<ConversationRecord> {
  const conv = await prisma.conversation.create({
    data: {
      userId,
      channel,
    },
  });
  return conv as ConversationRecord;
}

/**
 * Garante que a conversa pertence ao usuário.
 * Lança erro se não existir ou pertencer a outro usuário.
 */
export async function assertConversationOwned(
  conversationId: string,
  userId: string,
): Promise<void> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { userId: true },
  });

  if (!conv) {
    throw new Error(`Conversa não encontrada: ${conversationId}`);
  }

  if (conv.userId !== userId) {
    throw new Error(
      `Acesso negado: conversa ${conversationId} não pertence ao usuário ${userId}`,
    );
  }
}

/**
 * Carrega o histórico de mensagens de uma conversa.
 *
 * @param conversationId  ID da conversa.
 * @param budget          Número máximo de mensagens a retornar (default 20).
 *                        Passe 0 para retornar array vazio sem tocar o banco.
 */
export async function loadHistory(
  conversationId: string,
  budget: number = DEFAULT_HISTORY_BUDGET,
): Promise<HistoryMessage[]> {
  if (budget <= 0) return [];

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: budget,
    select: {
      id: true,
      role: true,
      content: true,
      toolCalls: true,
    },
  });

  return messages.map((m) => ({
    id: m.id,
    role: m.role as MessageRole,
    content: m.content,
    toolCalls: m.toolCalls
      ? (m.toolCalls as unknown as ToolCall[])
      : null,
  }));
}

/**
 * Persiste uma mensagem na conversa.
 *
 * @param conversationId  ID da conversa.
 * @param role            Papel da mensagem (user | assistant | tool).
 * @param content         Texto da mensagem.
 * @param toolCalls       Tool calls da mensagem assistant (opcional).
 */
export async function persistMessage(
  conversationId: string,
  role: MessageRole,
  content: string,
  toolCalls?: ToolCall[],
): Promise<void> {
  await prisma.message.create({
    data: {
      conversationId,
      role,
      content,
      toolCalls: toolCalls ? JSON.parse(JSON.stringify(toolCalls)) : undefined,
    },
  });
}
