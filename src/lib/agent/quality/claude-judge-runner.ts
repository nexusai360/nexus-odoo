/**
 * Runner compartilhado do JUIZO de qualidade via Claude Code headless.
 *
 * O juizo das avaliacoes PENDENTE e' feito pelo PROPRIO Claude Code (a
 * assinatura local, modelo Opus), NAO por um LLM via API. Dispara o CLI
 * `claude --dangerously-skip-permissions -p <prompt>` destacado, seguindo
 * docs/quality-judge-playbook.md.
 *
 * Dois disparadores compartilham este runner (e o MESMO lock in-process, ja
 * que ambos rodam no processo do Next dev):
 *   - Botao "Avaliar pendentes" (server action quality-evaluate-pendentes.ts).
 *   - Cron host-side (judge-scheduler.ts, agendado em instrumentation.ts).
 *
 * SO funciona em runtime local: o worker (container) nao enxerga o CLI `claude`
 * do host; por isso a avaliacao automatica vive aqui, no processo do host, e
 * nao no worker BullMQ.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { isLocalRuntime } from "@/lib/env-local";
import { prisma } from "@/lib/prisma";

/** Resolve o binario do Claude Code. `claude` costuma ser alias de shell (que
 *  o spawn nao enxerga); o binario real fica em ~/.local/bin/claude. Tenta o
 *  caminho padrao primeiro e cai para "claude" no PATH. */
export function resolveClaudeBin(): string {
  const home = process.env.HOME ?? "";
  const standard = join(home, ".local", "bin", "claude");
  return home && existsSync(standard) ? standard : "claude";
}

export const JUDGE_PROMPT =
  "Avalie as avaliacoes PENDENTE do Backtest seguindo docs/quality-judge-playbook.md. " +
  "O JUIZO E SEU (Claude Code), NAO use GPT nem nenhum LLM externo. Passos: " +
  "1) rode `npx tsx scripts/quality-audit/pendentes-io.ts --dump`; " +
  "2) leia /tmp/nex-pendentes.json e julgue CADA item voce mesmo (status + patterns do vocabulario canonico + razoes); " +
  "3) escreva /tmp/nex-pendentes-judged.json e rode `npx tsx scripts/quality-audit/pendentes-io.ts --apply`. " +
  "Nao pare ate aplicar. Seja conciso.";

// Lock in-process: o botao (server action) e o cron (instrumentation) rodam no
// MESMO processo do Next, entao um boolean de modulo serializa os dois , nunca
// dois `claude` julgando ao mesmo tempo. MAX_RUN_MS e' so um backstop anti-zumbi
// (o normal e' o evento 'exit' liberar o lock quando o judge termina).
const MAX_RUN_MS = 45 * 60_000;
let running = false;
let lastStartedAt = 0;

export function isJudgeRunning(): boolean {
  return running && Date.now() - lastStartedAt < MAX_RUN_MS;
}

export interface TriggerJudgeResult {
  started: boolean;
  pendentes: number;
  reason?: string;
}

/** Dispara o judge headless se: runtime local, ninguem rodando e ha pendentes.
 *  Idempotente e seguro para chamar de timer , so spawna 1 claude por vez. */
export async function triggerClaudeJudge(opts?: {
  source?: string;
}): Promise<TriggerJudgeResult> {
  const source = opts?.source ?? "?";
  if (!isLocalRuntime()) {
    return {
      started: false,
      pendentes: 0,
      reason: "Disponível apenas em ambiente local.",
    };
  }
  if (isJudgeRunning()) {
    return {
      started: false,
      pendentes: 0,
      reason: "Uma avaliação já está em andamento.",
    };
  }
  const pendentes = await prisma.conversationQualityEvaluation.count({
    where: { status: "PENDENTE" },
  });
  if (pendentes === 0) {
    return { started: false, pendentes: 0, reason: "Sem pendentes." };
  }

  running = true;
  lastStartedAt = Date.now();
  const release = () => {
    running = false;
  };

  const child = spawn(
    resolveClaudeBin(),
    ["--dangerously-skip-permissions", "-p", JUDGE_PROMPT],
    { cwd: process.cwd(), detached: true, stdio: "ignore", env: process.env },
  );
  child.on("error", (err) => {
    release();
    // eslint-disable-next-line no-console
    console.error(`[claude-judge] falha ao iniciar (${source}):`, err.message);
  });
  child.on("exit", release);
  child.unref();
  // Backstop: libera o lock mesmo se 'exit' nao chegar (processo destacado).
  setTimeout(release, MAX_RUN_MS).unref();

  // eslint-disable-next-line no-console
  console.log(`[claude-judge] disparado (${source}) , ${pendentes} pendentes`);
  return { started: true, pendentes };
}
