"use server";

/**
 * Server action LOCAL-ONLY: dispara a avaliacao (LLM-judge) das avaliacoes
 * PENDENTE do Backtest, rodando o script scripts/quality-audit/evaluate-pendentes.ts
 * nos bastidores (no proprio processo do dev server). So funciona em runtime
 * local (NODE_ENV != production) e para super_admin. Em producao recusa.
 */

import { spawn } from "node:child_process";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isLocalRuntime } from "@/lib/env-local";

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

/** Dispara o LLM-judge em background. Retorna a contagem inicial de pendentes.
 *  Idempotente: o script so toca status PENDENTE. */
export async function evaluatePendentesAction(): Promise<{
  started: boolean;
  pendentes: number;
  reason?: string;
}> {
  await gateSuperAdmin();
  if (!isLocalRuntime()) {
    return { started: false, pendentes: 0, reason: "Disponível apenas em ambiente local." };
  }
  const pendentes = await prisma.conversationQualityEvaluation.count({
    where: { status: "PENDENTE" },
  });
  if (pendentes === 0) return { started: false, pendentes: 0 };

  // Roda o script destacado; o proprio processo do dev server tem .env.local,
  // DATABASE_URL e a credencial LLM. stdout/err vao para /tmp para inspecao.
  const child = spawn(
    "npx",
    ["tsx", "scripts/quality-audit/evaluate-pendentes.ts"],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      env: process.env,
    },
  );
  child.unref();

  return { started: true, pendentes };
}
