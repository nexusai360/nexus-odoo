#!/usr/bin/env tsx
/**
 * Estagio 3 do fluxo de auditoria on-demand: aplica resultados da
 * avaliacao do Claude Code no banco (atualiza rows
 * ConversationQualityEvaluation com status, patterns, razoes).
 *
 * Spec: docs/superpowers/specs/2026-05-26-agente-qualidade-design.md §5.5
 *
 * CLI:
 *   pnpm tsx scripts/quality-audit/commit-audit-results.ts --results PATH [--force]
 *
 * Input JSON format:
 * {
 *   "results": [
 *     {
 *       "evaluationId": "uuid-da-eval",
 *       "status": "CORRETO|PARCIAL|ERRADO|FORA_DO_ESCOPO",
 *       "patterns": ["acerto_objetividade"],
 *       "razoes": "Diagnostico em texto livre"
 *     }
 *   ]
 * }
 */

import "dotenv/config";
import { config as loadDotenv } from "dotenv";
import { resolve as resolvePath } from "path";
loadDotenv({ path: resolvePath(process.cwd(), ".env.local"), override: true });

import { readFileSync } from "fs";
import { prisma } from "@/lib/prisma";

const JUDGE_MODEL = "claude-opus-4-7-via-cc";
const JUDGE_VERSION = "v2-claude-code";

const VALID_STATUS = ["CORRETO", "PARCIAL", "ERRADO", "FORA_DO_ESCOPO"] as const;
type ValidStatus = (typeof VALID_STATUS)[number];

interface Result {
  evaluationId: string;
  status: ValidStatus;
  patterns: string[];
  razoes: string;
}

interface ResultsFile {
  results: Result[];
}

interface Args {
  resultsPath: string;
  force: boolean;
}

function parseArgs(argv: string[]): Args {
  let resultsPath = "";
  let force = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--results") resultsPath = argv[++i] ?? "";
    else if (a === "--force") force = true;
  }
  if (!resultsPath) {
    console.error("Uso: --results PATH (obrigatorio)");
    process.exit(1);
  }
  return { resultsPath, force };
}

async function main() {
  const args = parseArgs(process.argv);
  const raw = readFileSync(args.resultsPath, "utf8");
  const parsed = JSON.parse(raw) as ResultsFile;

  if (!parsed.results || !Array.isArray(parsed.results)) {
    console.error("JSON invalido: esperado { results: [...] }");
    process.exit(1);
  }

  const counts: Record<string, number> = {
    CORRETO: 0,
    PARCIAL: 0,
    ERRADO: 0,
    FORA_DO_ESCOPO: 0,
  };
  let skipped = 0;
  let updated = 0;

  for (const r of parsed.results) {
    if (!VALID_STATUS.includes(r.status)) {
      console.warn(`Status invalido em ${r.evaluationId}: ${r.status}. Pulando.`);
      continue;
    }

    if (!args.force) {
      const existing = await prisma.conversationQualityEvaluation.findUnique({
        where: { id: r.evaluationId },
        select: { status: true },
      });
      if (existing && existing.status !== "PENDENTE") {
        skipped++;
        continue;
      }
    }

    await prisma.conversationQualityEvaluation.update({
      where: { id: r.evaluationId },
      data: {
        status: r.status,
        patterns: r.patterns ?? [],
        razoes: r.razoes ?? "",
        judgeModel: JUDGE_MODEL,
        judgeVersion: JUDGE_VERSION,
      },
    });

    counts[r.status]++;
    updated++;
  }

  console.log(`[commit] Atualizadas ${updated} rows.`);
  console.log(
    `  CORRETO: ${counts.CORRETO} | PARCIAL: ${counts.PARCIAL} | ERRADO: ${counts.ERRADO} | FORA_DO_ESCOPO: ${counts.FORA_DO_ESCOPO}`,
  );
  if (skipped > 0) {
    console.log(`  Puladas (ja avaliadas, sem --force): ${skipped}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[commit] erro:", err);
  process.exit(1);
});
