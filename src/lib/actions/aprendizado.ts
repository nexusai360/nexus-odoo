"use server";

/**
 * B3. Aba "Aprendizado": cruza a AVALIAÇÃO do usuário (MessageFeedback) com a
 * PERÍCIA da plataforma (ConversationQualityEvaluation) por `assistantMessageId`,
 * nas conversas in_app reais. Leitura exclusiva do cache interno (super_admin).
 * Toda a lógica de matriz/severidade/patterns vive em `aprendizado-helpers.ts`.
 */

import { prisma } from "@/lib/prisma";
import { requireMinRole } from "@/lib/auth/require";
import { periciaBucket } from "./monitoramento-bubble-helpers";
import {
  emptyMatrix,
  agreementPct,
  matrixTotals,
  aggregatePatterns,
  disagreementSeverity,
  type Bucket,
  type Matrix,
} from "./aprendizado-helpers";

export type DisagreementRow = {
  evaluationId: string;
  conversationId: string;
  question: string | null;
  answer: string | null;
  userRating: Bucket;
  userComment: string | null;
  judgeStatus: string; // status efetivo (humanStatus ?? status)
  judgeBucket: Bucket;
  razoes: string | null;
  model: string | null;
};

export type NegativeComment = {
  evaluationId: string | null;
  conversationId: string;
  rating: Bucket;
  comment: string;
};

export type AprendizadoOverview = {
  matrix: Matrix;
  agreementPct: number | null;
  crossed: number;
  disagreements: number;
  disagreementRows: DisagreementRow[];
  errorPatterns: Array<{ pattern: string; count: number }>;
  negativeComments: NegativeComment[];
};

const NON_CORRECT: Bucket[] = ["PARCIAL", "ERRADO", "ALUCINOU"];

export async function getAprendizadoOverview(): Promise<AprendizadoOverview> {
  await requireMinRole("super_admin");

  // AVALIAÇÃO do usuário (in_app), por mensagem.
  const feedbacks = await prisma.messageFeedback.findMany({
    where: { conversation: { channel: "in_app" } },
    select: {
      assistantMessageId: true,
      conversationId: true,
      rating: true,
      comment: true,
    },
  });

  // PERÍCIA terminal (in_app), por mensagem (1:1 com assistantMessageId).
  const evals = await prisma.conversationQualityEvaluation.findMany({
    where: { conversation: { channel: "in_app" }, assistantMessageId: { not: null } },
    select: {
      id: true,
      assistantMessageId: true,
      conversationId: true,
      status: true,
      humanStatus: true,
      patterns: true,
      razoes: true,
      model: true,
      questionSnapshot: true,
      answerSnapshot: true,
    },
  });
  const evalByMsg = new Map(evals.map((e) => [e.assistantMessageId!, e]));

  const matrix = emptyMatrix();
  const disagreementRows: DisagreementRow[] = [];

  for (const fb of feedbacks) {
    const ev = evalByMsg.get(fb.assistantMessageId);
    if (!ev) continue; // só cruza quem tem os dois
    const judgeBucket = periciaBucket(ev.humanStatus ?? ev.status);
    if (!judgeBucket) continue; // perícia não-terminal (PENDENTE) não cruza
    const userBucket = fb.rating as Bucket;
    matrix[userBucket][judgeBucket] += 1;
    if (userBucket !== judgeBucket) {
      disagreementRows.push({
        evaluationId: ev.id,
        conversationId: fb.conversationId,
        question: ev.questionSnapshot,
        answer: ev.answerSnapshot,
        userRating: userBucket,
        userComment: fb.comment,
        judgeStatus: ev.humanStatus ?? ev.status,
        judgeBucket,
        razoes: ev.razoes || null,
        model: ev.model,
      });
    }
  }

  disagreementRows.sort(
    (a, b) =>
      disagreementSeverity(b.userRating, b.judgeBucket) -
      disagreementSeverity(a.userRating, a.judgeBucket),
  );

  // PADRÕES DE ERRO: patterns das perícias não-corretas (efetivas) in_app.
  const errorEvals = evals.filter((e) => {
    const b = periciaBucket(e.humanStatus ?? e.status);
    return b !== null && b !== "CORRETO";
  });
  const errorPatterns = aggregatePatterns(errorEvals.map((e) => e.patterns));

  // COMENTÁRIOS NEGATIVOS do usuário (matéria-prima de correção): votos não
  // CORRETO com texto. Link pro Backtest quando há perícia da mesma mensagem.
  const negativeComments: NegativeComment[] = feedbacks
    .filter(
      (fb) =>
        NON_CORRECT.includes(fb.rating as Bucket) &&
        fb.comment != null &&
        fb.comment.trim().length > 0,
    )
    .map((fb) => ({
      evaluationId: evalByMsg.get(fb.assistantMessageId)?.id ?? null,
      conversationId: fb.conversationId,
      rating: fb.rating as Bucket,
      comment: fb.comment as string,
    }));

  const { crossed, disagreements } = matrixTotals(matrix);

  return {
    matrix,
    agreementPct: agreementPct(matrix),
    crossed,
    disagreements,
    disagreementRows: disagreementRows.slice(0, 100),
    errorPatterns: errorPatterns.slice(0, 20),
    negativeComments: negativeComments.slice(0, 100),
  };
}
