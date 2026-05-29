#!/usr/bin/env tsx
/**
 * R1 router de catalogo: CLI da calibragem offline contra perguntas das
 * rodadas historicas R8-R23.
 *
 * Spec: docs/superpowers/specs/2026-05-28-router-catalogo-design.md §10.1.7.
 * Plan: docs/superpowers/plans/2026-05-28-router-catalogo-plan.md §E2 §G2.
 *
 * A logica de verdade vive em src/lib/agent/router/calibrate.ts (compartilhada
 * com a rota admin POST /api/admin/router/calibrate). Este arquivo e' apenas o
 * wrapper de linha de comando: parse de flags, progresso no stdout e resumo.
 *
 * Custo: ~$0.003 (291 embeddings de pergunta). NAO chama LLM de chat.
 *
 * CLI:
 *   pnpm tsx scripts/router/calibrate-against-batteries.ts
 *   pnpm tsx scripts/router/calibrate-against-batteries.ts --threshold 0.55 --topK 3
 *   pnpm tsx scripts/router/calibrate-against-batteries.ts --limit 50
 */

// Carrega .env.local antes de @/lib/prisma (inicializa o client no import).
// Precisa ser o PRIMEIRO import. Ver scripts/router/load-env.ts.
import "./load-env";

import { runCalibration } from "@/lib/agent/router/calibrate";

type CliArgs = {
  threshold: number;
  topK: number;
  limit: number | null;
  logUsage: boolean;
  logDecisions: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    threshold: 0.55,
    topK: 3,
    limit: null,
    logUsage: false,
    logDecisions: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--threshold") args.threshold = parseFloat(argv[++i] ?? "0.55");
    else if (a === "--topK") args.topK = parseInt(argv[++i] ?? "3", 10);
    else if (a === "--limit") args.limit = parseInt(argv[++i] ?? "0", 10);
    else if (a === "--log-usage") args.logUsage = true;
    else if (a === "--log-decisions") args.logDecisions = true;
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  console.log(
    `[calibrate] settings: threshold=${args.threshold} topK=${args.topK}`,
  );

  const result = await runCalibration({
    threshold: args.threshold,
    topK: args.topK,
    limit: args.limit,
    writeReport: true,
    logUsageOrigin: args.logUsage ? "router" : undefined,
    logDecisions: args.logDecisions,
    onProgress: (processed, total) => {
      if (processed === 1) console.log(`[calibrate] dataset: ${total} perguntas`);
      if (processed % 20 === 0) console.log(`[calibrate] ${processed}/${total}`);
    },
  });

  console.log("");
  if (result.reportPath) {
    console.log(`[calibrate] Relatorio salvo em ${result.reportPath}`);
  }
  console.log(`[calibrate] Top-1: ${(result.top1Accuracy * 100).toFixed(1)}%`);
  console.log(`[calibrate] Top-K: ${(result.topKAccuracy * 100).toFixed(1)}%`);
  console.log(`[calibrate] Fallbacks: ${result.fallbacks}/${result.datasetSize}`);
  console.log(`[calibrate] p95 latencia: ${result.latencyP95}ms`);

  if (result.promotable) {
    console.log(
      "\n[calibrate] OK cobertura Top-K >= 95%, apto para ativacao em painel admin.",
    );
  } else {
    console.log(
      "\n[calibrate] X cobertura Top-K < 95%, ajustar domain-vocabulary.ts e re-rodar.",
    );
  }
}

main()
  .catch((err) => {
    console.error("[calibrate] FALHA:", err);
    process.exit(1);
  })
  .finally(() => {
    // tsx + prisma podem deixar handles abertos; forcar saida.
    setTimeout(() => process.exit(0), 100);
  });
