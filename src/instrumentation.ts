/**
 * Hook de instrumentacao do Next (roda uma vez no boot do servidor).
 *
 * Usado para ligar o agendador host-side da avaliacao de qualidade via Claude
 * Code headless. SO em runtime local (dev): em producao nao ha CLI `claude`, e
 * o agendador depende dele. Gateado tambem por NEXT_RUNTIME=nodejs (nao roda no
 * edge).
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { isLocalRuntime } = await import("@/lib/env-local");
  if (!isLocalRuntime()) return;

  const { startQualityJudgeScheduler } = await import(
    "@/lib/agent/quality/judge-scheduler"
  );
  startQualityJudgeScheduler();
}
