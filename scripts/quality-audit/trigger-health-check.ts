#!/usr/bin/env tsx
/**
 * Health check do trigger de criacao de eval PENDENTE.
 *
 * Detecta caso em que o trigger esta silenciosamente quebrado (ex: schema
 * mudou e prisma client esta stale, ou erro permanente). Compara conversas
 * dos ultimos 7 dias com evals criadas no mesmo periodo. Se houver conversas
 * mas zero evals, sinaliza problema.
 *
 * Spec: docs/superpowers/specs/2026-05-26-agente-qualidade-design.md §6 Observabilidade
 *
 * CLI:
 *   pnpm tsx scripts/quality-audit/trigger-health-check.ts
 *
 * Exit code: 0 se saudavel, 1 se anomalia detectada.
 */

import "dotenv/config";
import { config as loadDotenv } from "dotenv";
import { resolve as resolvePath } from "path";
loadDotenv({ path: resolvePath(process.cwd(), ".env.local"), override: true });

import { prisma } from "@/lib/prisma";

async function main() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [assistantCount, evalCount] = await Promise.all([
    prisma.message.count({
      where: { role: "assistant", createdAt: { gte: sevenDaysAgo } },
    }),
    prisma.conversationQualityEvaluation.count({
      where: {
        createdAt: { gte: sevenDaysAgo },
        status: { not: "FALHA_TECNICA" },
      },
    }),
  ]);

  console.log(`[health-check] Ultimos 7 dias:`);
  console.log(`  Assistant messages: ${assistantCount}`);
  console.log(`  Evaluations criadas (excl. FALHA_TECNICA): ${evalCount}`);

  if (assistantCount > 0 && evalCount === 0) {
    console.error(
      `[health-check] ALERTA: ${assistantCount} respostas do agente nos ultimos 7 dias, mas 0 evals criadas. Trigger pode estar quebrado.`,
    );
    process.exit(1);
  }

  const coverage =
    assistantCount > 0
      ? ((evalCount / assistantCount) * 100).toFixed(1)
      : "N/A";
  console.log(`[health-check] Cobertura: ${coverage}% (saudavel >= 95%)`);

  if (assistantCount > 0 && evalCount / assistantCount < 0.95) {
    console.warn(
      `[health-check] Cobertura abaixo de 95%. Investigar se o trigger esta falhando em alguns casos.`,
    );
    process.exit(1);
  }

  console.log(`[health-check] OK`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[health-check] erro:", err);
  process.exit(1);
});
