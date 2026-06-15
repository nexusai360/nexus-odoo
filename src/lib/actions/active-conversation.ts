"use server";

/**
 * Conversa ativa da bubble do Agente Nex.
 *
 * - getActiveConversationId: resolve, no boot do layout, a conversa in_app da
 *   sessao atual para a bubble restaurar o historico apos F5/logout. A sessao
 *   atual e a ULTIMA conversa in_app do usuario, e so e restaurada se ainda
 *   estiver ABERTA (endedAt = null). De proposito NAO filtramos endedAt no
 *   banco: se a mais recente foi arquivada ("Limpar sessao"), nao se deve descer
 *   e ressuscitar uma conversa ANTIGA que ficou sem arquivar (orfa). Sem janela
 *   de tempo: a sessao dura ate o usuario limpar, mas qualquer conversa mais
 *   nova (mesmo ja arquivada) supera as orfas antigas. Esse era o bug do "ghost"
 *   da bubble (uma conversa de dias atras reaparecia ao recarregar).
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
  // Pega a ULTIMA conversa in_app do canal (sem filtrar endedAt) e so restaura
  // se ela ainda estiver aberta. Assim uma conversa nova/arquivada sempre supera
  // orfas antigas, sem precisar de janela de tempo.
  const conv = await prisma.conversation.findFirst({
    where: { userId: user.id, channel: "in_app" },
    orderBy: { updatedAt: "desc" },
    select: { id: true, endedAt: true },
  });
  const conversationId = conv && conv.endedAt === null ? conv.id : null;
  return { ok: true, conversationId };
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
