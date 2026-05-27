/**
 * Trigger do sistema de qualidade (/agente/qualidade).
 *
 * `createPendingEval`: chamado fire-and-forget no fim do turno bem-sucedido
 * do agente. Insere row em ConversationQualityEvaluation com status PENDENTE.
 * Captura snapshots da pergunta e resposta para preservar contexto auditivel
 * (LGPD: se a Message for deletada depois, a avaliacao mantem o snapshot).
 *
 * `createTechnicalFailureEval`: chamado fire-and-forget no catch externo do
 * runAgent quando o turno falha tecnicamente (timeout, tool crash, etc).
 * NAO busca lastUserMsg via query , race condition se o erro foi antes do
 * persistMessage("user") rodar. Usa args.userMessage direto e deixa
 * userMessageId nullable.
 *
 * Spec: docs/superpowers/specs/2026-05-26-agente-qualidade-design.md §5.4
 */

import { prisma } from "@/lib/prisma";

const JUDGE_VERSION = "v2-claude-code";
const SNAPSHOT_CAP = 4000;
const ERROR_CAP = 1000;

export interface CreatePendingEvalArgs {
  conversationId: string;
  assistantMessageId: string;
  userMessage: string;
  answerMessage: string;
  model: string;
  /**
   * Chips de sugestao apresentados ao usuario (bolinhas roxas da bubble),
   * apos extracao do canal [[suggestions]] / bullet-questions. Snapshot
   * pra reconstituir o que o usuario realmente viu.
   */
  suggestions?: string[];
}

export async function createPendingEval(
  args: CreatePendingEvalArgs,
): Promise<void> {
  const lastUserMsg = await prisma.message.findFirst({
    where: { conversationId: args.conversationId, role: "user" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  await prisma.conversationQualityEvaluation.create({
    data: {
      conversationId: args.conversationId,
      userMessageId: lastUserMsg?.id ?? null,
      assistantMessageId: args.assistantMessageId,
      judgeVersion: JUDGE_VERSION,
      status: "PENDENTE",
      model: args.model,
      questionSnapshot: args.userMessage.slice(0, SNAPSHOT_CAP),
      answerSnapshot: args.answerMessage.slice(0, SNAPSHOT_CAP),
      suggestions: args.suggestions ?? [],
    },
  });
}

export interface CreateTechnicalFailureEvalArgs {
  conversationId: string;
  userMessage: string;
  model: string;
  errorMessage: string;
}

export async function createTechnicalFailureEval(
  args: CreateTechnicalFailureEvalArgs,
): Promise<void> {
  await prisma.conversationQualityEvaluation.create({
    data: {
      conversationId: args.conversationId,
      userMessageId: null,
      assistantMessageId: null,
      judgeVersion: JUDGE_VERSION,
      status: "FALHA_TECNICA",
      model: args.model,
      questionSnapshot: args.userMessage.slice(0, SNAPSHOT_CAP),
      answerSnapshot: null,
      technicalError: args.errorMessage.slice(0, ERROR_CAP),
    },
  });
}
