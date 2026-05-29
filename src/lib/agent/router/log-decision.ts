// R1 router de catalogo: persistencia da decisao do router em
// `AgentRouterDecision`.
//
// Spec: docs/superpowers/specs/2026-05-28-router-catalogo-design.md §5.1 §6.
// Padrao fire-and-forget: erros de persistencia NAO quebram o turno do agente
// (warn estruturado para diagnostico posterior).

import { prisma } from "@/lib/prisma";
import { getToolDomains } from "./tool-to-domain";
import type { RouterDecision } from "./types";

export type LogMode =
  | "shadow"
  | "active"
  | "calibracao"
  | "calibracao_R-X"
  | "test"
  | "e2e";

export type CreateDecisionInput = {
  decision: RouterDecision;
  mode: LogMode;
  catalogSizeOffered: number;
  catalogSizeFull: number;
  userQuestion: string;
  conversationId?: string | null;
  messageId?: string | null;
  llmModelUsed?: string | null;
  questionTokenCount?: number | null;
  /** Para calibragem offline: tools/dominios "esperados" (o label da bateria),
   *  ja que nao ha LLM chamando tools de verdade. Em producao fica vazio aqui
   *  e e' preenchido depois por updateDecision. */
  toolsActuallyUsed?: string[];
  toolsDomains?: string[];
};

export type CreateDecisionResult = {
  decisionId: string;
  persisted: boolean;
};

/** Cria row em AgentRouterDecision. Em caso de erro de banco, retorna um cuid
 *  local (nao persistido) para que o caller siga o turno normalmente. Logs
 *  estruturados permitem diagnostico depois. */
export async function createDecision(
  input: CreateDecisionInput,
): Promise<CreateDecisionResult> {
  try {
    // Prisma gera o cuid via @default(cuid()); pegamos do retorno.
    const row = await prisma.agentRouterDecision.create({
      data: {
        userQuestion: input.userQuestion,
        questionTokenCount: input.questionTokenCount ?? null,
        pickedDomains: input.decision.pickedDomains,
        scores: input.decision.scores,
        topScore: input.decision.topScore,
        fallbackTriggered: input.decision.fallback.triggered,
        fallbackReason: input.decision.fallback.reason ?? null,
        routerVersion: input.decision.routerVersion,
        mode: input.mode,
        catalogSizeOffered: input.catalogSizeOffered,
        catalogSizeFull: input.catalogSizeFull,
        toolsActuallyUsed: input.toolsActuallyUsed ?? [],
        toolsDomains: input.toolsDomains ?? [],
        llmModelUsed: input.llmModelUsed ?? null,
        pickDurationMs: input.decision.pickDurationMs,
        conversationId: input.conversationId ?? null,
        messageId: input.messageId ?? null,
      },
      select: { id: true },
    });
    return { decisionId: row.id, persisted: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[router:log] create failed", {
      decisionId: null,
      error: errorMessage(err),
      context: {
        mode: input.mode,
        conversationId: input.conversationId ?? null,
        messageId: input.messageId ?? null,
      },
    });
    return {
      decisionId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      persisted: false,
    };
  }
}

export type UpdateDecisionInput = {
  toolsUsed: string[];
  catalogSizeOffered?: number;
};

/** Atualiza row apos LLM responder, registrando quais tools foram chamadas.
 *  Fire-and-forget: nao quebra o turno em caso de erro. */
export async function updateDecision(
  decisionId: string,
  input: UpdateDecisionInput,
): Promise<void> {
  try {
    const toolsDomains = getToolDomains(input.toolsUsed);
    await prisma.agentRouterDecision.update({
      where: { id: decisionId },
      data: {
        toolsActuallyUsed: input.toolsUsed,
        toolsDomains,
        ...(input.catalogSizeOffered !== undefined
          ? { catalogSizeOffered: input.catalogSizeOffered }
          : {}),
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[router:log] update failed", {
      decisionId,
      error: errorMessage(err),
      context: { toolsUsed: input.toolsUsed },
    });
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
