"use server";

/**
 * Server action LOCAL-ONLY: dispara a avaliacao (LLM-judge) das avaliacoes
 * PENDENTE do Backtest, rodando o script scripts/quality-audit/evaluate-pendentes.ts
 * nos bastidores (no proprio processo do dev server). So funciona em runtime
 * local (NODE_ENV != production) e para super_admin. Em producao recusa.
 */

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { triggerClaudeJudge } from "@/lib/agent/quality/claude-judge-runner";

async function gateSuperAdmin() {
  const user = await getCurrentUser();
  if (!user || user.platformRole !== "super_admin") {
    throw new Error("Acesso negado");
  }
}

/** Conta avaliacoes pendentes (para o badge do botao e o polling). */
export async function countPendentes(): Promise<number> {
  await gateSuperAdmin();
  return prisma.conversationQualityEvaluation.count({
    where: { status: "PENDENTE" },
  });
}

/** Dispara o juízo dos pendentes pelo PRÓPRIO Claude Code (headless, sem GPT).
 *  So em runtime local (a maquina do operador tem o CLI `claude` autenticado).
 *  Mesma maquina usada pelo cron host-side (judge-scheduler.ts), com o mesmo
 *  lock in-process , nunca dois judges ao mesmo tempo. */
export async function evaluatePendentesAction(): Promise<{
  started: boolean;
  pendentes: number;
  reason?: string;
}> {
  await gateSuperAdmin();
  return triggerClaudeJudge({ source: "botao-avaliar-pendentes" });
}
