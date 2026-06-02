"use server";

/**
 * Server action LOCAL-ONLY: dispara a avaliacao (LLM-judge) das avaliacoes
 * PENDENTE do Backtest, rodando o script scripts/quality-audit/evaluate-pendentes.ts
 * nos bastidores (no proprio processo do dev server). So funciona em runtime
 * local (NODE_ENV != production) e para super_admin. Em producao recusa.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isLocalRuntime } from "@/lib/env-local";

/** Resolve o binario do Claude Code. `claude` costuma ser alias de shell (que
 *  o spawn nao enxerga); o binario real fica em ~/.local/bin/claude. Tenta o
 *  caminho padrao primeiro e cai para "claude" no PATH. */
function resolveClaudeBin(): string {
  const home = process.env.HOME ?? "";
  const standard = join(home, ".local", "bin", "claude");
  return home && existsSync(standard) ? standard : "claude";
}

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

const JUDGE_PROMPT =
  "Avalie as avaliacoes PENDENTE do Backtest seguindo docs/quality-judge-playbook.md. " +
  "O JUIZO E SEU (Claude Code), NAO use GPT nem nenhum LLM externo. Passos: " +
  "1) rode `npx tsx scripts/quality-audit/pendentes-io.ts --dump`; " +
  "2) leia /tmp/nex-pendentes.json e julgue CADA item voce mesmo (status + patterns do vocabulario canonico + razoes); " +
  "3) escreva /tmp/nex-pendentes-judged.json e rode `npx tsx scripts/quality-audit/pendentes-io.ts --apply`. " +
  "Nao pare ate aplicar. Seja conciso.";

/** Dispara o juízo dos pendentes pelo PRÓPRIO Claude Code (headless, sem GPT).
 *  So em runtime local (a maquina do operador tem o CLI `claude` autenticado).
 *  Retorna a contagem inicial de pendentes. Idempotente (só toca PENDENTE). */
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

  // Dispara o Claude Code headless (a assinatura) , NAO um LLM via API. Roda
  // destacado, no diretorio do projeto; o juizo e' feito pelo proprio Claude.
  const child = spawn(
    resolveClaudeBin(),
    ["--dangerously-skip-permissions", "-p", JUDGE_PROMPT],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      env: process.env,
    },
  );
  child.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("[avaliar-pendentes] falha ao iniciar claude:", err.message);
  });
  child.unref();

  return { started: true, pendentes };
}
