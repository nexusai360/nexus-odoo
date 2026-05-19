"use server";

/**
 * Server Action: lê o histórico de mensagens de uma conversa.
 *
 * Garante que a conversa pertence ao usuário autenticado antes de retornar.
 * Usado pelo ChatPanel para popular o histórico ao selecionar uma conversa.
 */

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface ConversationMessageDto {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  createdAt: string;
}

export async function getConversationMessages(
  conversationId: string,
): Promise<{ ok: true; messages: ConversationMessageDto[] } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Não autenticado" };
  }

  // Verifica propriedade da conversa
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { userId: true },
  });

  if (!conv) {
    return { ok: false, error: "Conversa não encontrada" };
  }

  if (conv.userId !== user.id) {
    return { ok: false, error: "Acesso negado" };
  }

  // Busca as últimas 100 mensagens em ordem cronológica
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
    },
  });

  return {
    ok: true,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role as ConversationMessageDto["role"],
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}
