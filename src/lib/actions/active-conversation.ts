"use server";

/**
 * Conversa ativa da bubble do Agente Nex.
 *
 * - getActiveConversationId: resolve, no boot do layout, a conversa in_app
 *   ativa (endedAt = null) mais recente do usuario, para a bubble restaurar o
 *   historico apos F5/logout.
 * - archiveActiveConversation: "Limpar sessao". Arquiva (endedAt = now), nao
 *   deleta. Idempotente e dona-do-recurso (so o proprio usuario).
 */

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getActiveConversationId(): Promise<
  { ok: true; conversationId: string | null } | { ok: false }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const conv = await prisma.conversation.findFirst({
    where: { userId: user.id, channel: "in_app", endedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  return { ok: true, conversationId: conv?.id ?? null };
}

export async function archiveActiveConversation(
  conversationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Não autenticado" };
  if (!conversationId || typeof conversationId !== "string") {
    return { ok: false, error: "conversationId obrigatório" };
  }
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { userId: true, endedAt: true },
  });
  if (!conv) return { ok: false, error: "Conversa não encontrada" };
  if (conv.userId !== user.id) return { ok: false, error: "Acesso negado" };
  if (conv.endedAt !== null) return { ok: true };
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { endedAt: new Date() },
  });
  return { ok: true };
}
