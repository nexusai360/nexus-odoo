"use server";

/**
 * B1. Captura do feedback do usuário sobre uma resposta do Agente Nex.
 *
 * Leitura/escrita do cache interno (Postgres da plataforma). Jamais toca Odoo
 * nem write-tool do MCP (auth modo INTERNO; decisão #2 do CLAUDE.md).
 *
 * Voto vigente em `message_feedback` (último vale) + histórico append-only em
 * `message_feedback_event`. Spec: docs/superpowers/specs/2026-06-04-b1-feedback-usuario-bubble-design.md
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const RATINGS = ["CORRETO", "PARCIAL", "ERRADO", "ALUCINOU"] as const;

const InputSchema = z.object({
  assistantMessageId: z.string().uuid(),
  rating: z.enum(RATINGS),
  comment: z.string().trim().max(100).optional(),
});

type Data = {
  rating: (typeof RATINGS)[number];
  comment: string | null;
  updatedAt: Date;
};
type Result = { success: true; data: Data } | { success: false; error: string };

export async function submitMessageFeedback(input: unknown): Promise<Result> {
  const me = await getCurrentUser();
  const userId = me?.id;
  if (!userId) return { success: false, error: "Não autenticado." };

  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Dados inválidos." };
  const { assistantMessageId, rating } = parsed.data;
  const comment =
    parsed.data.comment && parsed.data.comment.length > 0
      ? parsed.data.comment
      : null;

  // Autorização: a mensagem é uma resposta do agente numa conversa in_app do usuário.
  const message = await prisma.message.findUnique({
    where: { id: assistantMessageId },
    select: {
      id: true,
      role: true,
      conversation: { select: { id: true, userId: true, channel: true } },
    },
  });
  if (!message || message.role !== "assistant") {
    return { success: false, error: "Mensagem inválida." };
  }
  const conv = message.conversation;
  if (conv.userId !== userId || conv.channel !== "in_app") {
    return { success: false, error: "Não autorizado." };
  }

  // Checkpoint (defesa em profundidade; a UI já não mostra fora de PRODUCTION).
  const settings = await prisma.agentSettings.findUnique({
    where: { id: "global" },
    select: { feedbackCheckpoint: true },
  });
  if (settings?.feedbackCheckpoint !== "PRODUCTION") {
    return { success: false, error: "Feedback desativado." };
  }

  const current = await prisma.messageFeedback.findUnique({
    where: { assistantMessageId_userId: { assistantMessageId, userId } },
    select: { id: true, rating: true, comment: true },
  });

  // Idempotência: nada mudou (rating e comentário normalizados iguais).
  const norm = (c: string | null) => c ?? "";
  if (
    current &&
    current.rating === rating &&
    norm(current.comment) === norm(comment)
  ) {
    return {
      success: true,
      data: { rating: current.rating, comment: current.comment, updatedAt: new Date() },
    };
  }

  const data = await prisma.$transaction(async (tx) => {
    if (!current) {
      const fb = await tx.messageFeedback.create({
        data: { conversationId: conv.id, assistantMessageId, userId, rating, comment },
        select: { id: true, rating: true, comment: true, updatedAt: true },
      });
      await tx.messageFeedbackEvent.create({
        data: { feedbackId: fb.id, rating, comment, action: "created" },
      });
      return fb;
    }
    if (current.rating !== rating) {
      // Decisão #4: trocar o rating descarta o comentário vigente.
      const fb = await tx.messageFeedback.update({
        where: { id: current.id },
        data: { rating, comment: null },
        select: { id: true, rating: true, comment: true, updatedAt: true },
      });
      await tx.messageFeedbackEvent.create({
        data: { feedbackId: fb.id, rating, comment: null, action: "rating_changed" },
      });
      return fb;
    }
    // rating igual, comentário mudou.
    const action = current.comment == null ? "comment_set" : "comment_edited";
    const fb = await tx.messageFeedback.update({
      where: { id: current.id },
      data: { comment },
      select: { id: true, rating: true, comment: true, updatedAt: true },
    });
    await tx.messageFeedbackEvent.create({
      data: { feedbackId: fb.id, rating, comment, action },
    });
    return fb;
  });

  return {
    success: true,
    data: { rating: data.rating, comment: data.comment, updatedAt: data.updatedAt },
  };
}
