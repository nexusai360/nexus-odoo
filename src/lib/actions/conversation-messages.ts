"use server";

/**
 * Server Action: lê o histórico de mensagens de uma conversa.
 *
 * Garante que a conversa pertence ao usuário autenticado antes de retornar.
 * Usado pelo ChatPanel para popular o histórico ao selecionar uma conversa.
 */

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { progressLabel } from "@/lib/agent/progress-labels";

export interface ConversationMessageDto {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  createdAt: string;
  /** Trilha de "Raciocinio" reconstruida do toolResults persistido (labels das
   *  tools consultadas). Vazio quando a mensagem nao consultou tools. */
  steps?: { label: string }[];
  /** B1. Voto vigente do usuario atual sobre esta resposta (null/ausente = sem voto). */
  feedback?: {
    rating: "CORRETO" | "PARCIAL" | "ERRADO" | "ALUCINOU";
    comment: string | null;
  } | null;
}

/**
 * Reconstroi os rotulos da trilha "Raciocinio" a partir do toolCalls
 * persistido. Formato real (verificado no banco): Array<{ id, name, arguments }>,
 * onde `name` e o id da tool (ex.: "fiscal_faturamento_por_uf"). Defensivo
 * contra formatos legados/null.
 */
function stepsFromToolCalls(toolCalls: unknown): { label: string }[] {
  if (!Array.isArray(toolCalls)) return [];
  const out: { label: string }[] = [];
  for (const item of toolCalls) {
    const name =
      item && typeof item === "object"
        ? (item as { name?: unknown }).name
        : undefined;
    if (typeof name === "string" && name.length > 0) {
      out.push({ label: progressLabel(name) });
    }
  }
  return out;
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

  // Busca as últimas 100 mensagens em ordem cronológica. A bubble nunca
  // recarrega uma conversa arquivada ("Limpar sessao"): filtra endedAt null.
  const messages = await prisma.message.findMany({
    where: { conversationId, conversation: { endedAt: null } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
      toolCalls: true,
    },
  });

  // B1. Voto vigente do usuário atual por mensagem desta conversa.
  const feedbacks = await prisma.messageFeedback.findMany({
    where: { conversationId, userId: user.id },
    select: { assistantMessageId: true, rating: true, comment: true },
  });
  const fbByMsg = new Map(
    feedbacks.map((f) => [
      f.assistantMessageId,
      { rating: f.rating, comment: f.comment },
    ]),
  );

  return {
    ok: true,
    messages: messages.map((m) => {
      const steps = stepsFromToolCalls(m.toolCalls);
      const fb = fbByMsg.get(m.id) ?? null;
      return {
        id: m.id,
        role: m.role as ConversationMessageDto["role"],
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        ...(steps.length > 0 ? { steps } : {}),
        ...(fb ? { feedback: fb } : {}),
      };
    }),
  };
}
