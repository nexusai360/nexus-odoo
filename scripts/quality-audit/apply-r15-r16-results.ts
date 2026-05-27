#!/usr/bin/env tsx
/**
 * Aplica os results da R15 + R16 (avaliados pelos subagentes) no banco
 * ConversationQualityEvaluation, resolvendo as evaluations PENDENTE.
 *
 * Lê: docs/agent-quality-review/results-r15/batch-*.json
 *     docs/agent-quality-review/results-r16/batch-*.json
 *
 * Mapeia turnoId (assistant message.id) -> evaluationId via SELECT.
 *
 * CLI: pnpm tsx scripts/quality-audit/apply-r15-r16-results.ts
 */
import "dotenv/config";
import { config as loadDotenv } from "dotenv";
import { resolve as resolvePath } from "path";
loadDotenv({ path: resolvePath(process.cwd(), ".env.local"), override: true });

import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { prisma } from "@/lib/prisma";

const VALID = new Set(["CORRETO", "PARCIAL", "ERRADO", "FORA_DE_ESCOPO"]);

interface TurnoEval {
  turnoId: string;
  status: string;
  patterns?: string[];
  razao?: string;
}

async function loadResults(dir: string) {
  const files = readdirSync(dir).filter(
    (f) => f.startsWith("batch-") && f.endsWith("-result.json"),
  );
  const out: TurnoEval[] = [];
  for (const f of files) {
    const d = JSON.parse(readFileSync(resolve(dir, f), "utf-8"));
    for (const t of d.turnos as TurnoEval[]) out.push(t);
  }
  return out;
}

async function applyBatch(label: string, turnos: TurnoEval[]) {
  console.log(`\n[${label}] ${turnos.length} turnos a aplicar`);
  let ok = 0;
  let skipped = 0;
  let notFound = 0;
  for (const t of turnos) {
    if (!VALID.has(t.status)) {
      console.warn(`  ! status invalido em ${t.turnoId}: ${t.status}`);
      skipped++;
      continue;
    }
    const eval_ = await prisma.conversationQualityEvaluation.findFirst({
      where: { assistantMessageId: t.turnoId },
      select: { id: true, status: true },
    });
    if (!eval_) {
      notFound++;
      continue;
    }
    await prisma.conversationQualityEvaluation.update({
      where: { id: eval_.id },
      data: {
        status: t.status,
        patterns: t.patterns ?? [],
        razoes: t.razao ?? "",
        judgeVersion: `subagent-${label}`,
      },
    });
    ok++;
  }
  console.log(`  ok=${ok} | not_found=${notFound} | skipped=${skipped}`);
}

async function main() {
  const r15 = await loadResults(
    resolve(process.cwd(), "docs/agent-quality-review/results-r15"),
  );
  const r16 = await loadResults(
    resolve(process.cwd(), "docs/agent-quality-review/results-r16"),
  );
  await applyBatch("R15", r15);
  await applyBatch("R16", r16);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
