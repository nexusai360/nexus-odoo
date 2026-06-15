/**
 * Agendador host-side da avaliacao automatica de qualidade via Claude Code.
 *
 * Substitui o antigo cron heuristico (sem LLM) que rodava no worker. O worker
 * vive num container e NAO enxerga o CLI `claude` do host; por isso a avaliacao
 * automatica passou a viver aqui, no processo do Next (host), disparada por
 * instrumentation.ts SO em runtime local.
 *
 * Cadencia: le AgentSettings.qualityHeuristicIntervalMinutes (mesma config que
 * antes regia o heuristico; default 240 min). A cada ciclo reagenda lendo o
 * valor de novo, entao mudar a config vale sem reiniciar. NAO dispara no boot
 * (so apos o primeiro intervalo), pra um restart de dev nao acionar um judge.
 */

import { prisma } from "@/lib/prisma";
import { triggerClaudeJudge } from "./claude-judge-runner";

let started = false;

async function readIntervalMs(): Promise<number> {
  try {
    const row = await prisma.agentSettings.findUnique({
      where: { id: "global" },
      select: { qualityHeuristicIntervalMinutes: true },
    });
    const minutes = Math.max(
      5,
      Math.min(1440, row?.qualityHeuristicIntervalMinutes ?? 240),
    );
    return minutes * 60_000;
  } catch {
    return 240 * 60_000;
  }
}

/** Inicia o loop de agendamento (idempotente). Cada tick dispara o judge se
 *  houver pendentes e ninguem rodando (lock no claude-judge-runner). */
export function startQualityJudgeScheduler(): void {
  if (started) return;
  started = true;

  const scheduleNext = async () => {
    const ms = await readIntervalMs();
    const timer = setTimeout(async () => {
      try {
        const res = await triggerClaudeJudge({ source: "cron-host" });
        if (res.started) {
          // eslint-disable-next-line no-console
          console.log(
            `[quality-judge-cron] judge disparado , ${res.pendentes} pendentes`,
          );
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          "[quality-judge-cron] erro no tick:",
          (err as Error).message,
        );
      }
      void scheduleNext();
    }, ms);
    // Nao segura o event loop / nao impede o processo de encerrar.
    timer.unref();
  };

  void scheduleNext();

  // BOOT-FIRE guardado (D2): ~3min após o boot, dispara UMA vez se houver fila.
  // `triggerClaudeJudge` é idempotente (lock in-process + só dispara com
  // PENDENTE/REAVALIAR > 0), então não há risco de duplo juízo nem de rodar à
  // toa. Resolve o problema do timer de 240min nunca chegar (restart de dev
  // zerava a contagem e a perícia ficava parada).
  const bootTimer = setTimeout(async () => {
    try {
      const res = await triggerClaudeJudge({ source: "boot" });
      if (res.started) {
        // eslint-disable-next-line no-console
        console.log(
          `[quality-judge-cron] boot-fire , ${res.pendentes} na fila`,
        );
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        "[quality-judge-cron] erro no boot-fire:",
        (err as Error).message,
      );
    }
  }, 3 * 60_000);
  bootTimer.unref();

  // eslint-disable-next-line no-console
  console.log(
    "[quality-judge-cron] agendador local iniciado (Claude Code headless)",
  );
}
