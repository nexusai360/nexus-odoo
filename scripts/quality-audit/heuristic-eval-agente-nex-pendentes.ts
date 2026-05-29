#!/usr/bin/env tsx
/**
 * Wrapper CLI da auditoria heuristica de pendentes do Agente Nex/Playground.
 * A logica vive em src/lib/agent/quality/auto-heuristic.ts (compartilhada
 * com o worker BullMQ, que roda em cron configurado em AgentSettings).
 *
 * Uso manual:
 *   pnpm tsx scripts/quality-audit/heuristic-eval-agente-nex-pendentes.ts
 */
// Primeiro import: carrega .env.local antes de @/lib/prisma (ver load-env.ts).
import "./load-env";
import "dotenv/config";
import { config as loadDotenv } from "dotenv";
import { resolve as resolvePath } from "path";
loadDotenv({ path: resolvePath(process.cwd(), ".env.local"), override: true });

import { prisma } from "@/lib/prisma";
import { runAutoHeuristic } from "@/lib/agent/quality/auto-heuristic";

async function main() {
  const r = await runAutoHeuristic();
  console.log(
    `\nProcessadas: ${r.processadas}\n  CORRETO=${r.totals.CORRETO} ` +
      `PARCIAL=${r.totals.PARCIAL} ERRADO=${r.totals.ERRADO} ` +
      `FORA=${r.totals.FORA_DO_ESCOPO}`,
  );
}

main()
  .catch((err) => {
    console.error("FALHA:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
