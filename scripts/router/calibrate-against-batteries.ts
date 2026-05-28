#!/usr/bin/env tsx
/**
 * R1 router de catalogo: calibragem offline contra perguntas das rodadas
 * historicas R8-R23.
 *
 * Spec: docs/superpowers/specs/2026-05-28-router-catalogo-design.md §10.1.7.
 * Plan: docs/superpowers/plans/2026-05-28-router-catalogo-plan.md §E2 §G2.
 *
 * NAO chama LLM. Apenas:
 *   1. carrega o dataset oficial em scripts/quality-audit/test-questions.json
 *   2. roda pickDomains contra cada pergunta (embed + cosine)
 *   3. compara dominio rotulado pela bateria vs dominio escolhido pelo router
 *   4. produz docs/router-calibration-r1.md com tabela + KPIs
 *
 * Custo: ~$0.003 (291 embeddings de pergunta).
 *
 * CLI:
 *   pnpm tsx scripts/router/calibrate-against-batteries.ts
 *   pnpm tsx scripts/router/calibrate-against-batteries.ts --threshold 0.55 --topK 3
 *   pnpm tsx scripts/router/calibrate-against-batteries.ts --limit 50
 */

import { config as loadDotenv } from "dotenv";
import { resolve as resolvePath } from "path";
loadDotenv({ path: resolvePath(process.cwd(), ".env.local"), override: true });

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { pickDomains } from "@/lib/agent/router/pick-domains";

// Dominios da bateria que NAO sao dominios do MCP — sao categorias semanticas.
// Mapeamos para a interpretacao mais razoavel para fim de avaliacao.
const DOMAIN_LABEL_ALIAS: Record<string, string> = {
  complexos_e_mistos: "_misto",
  informais_e_dialeticos: "_informal",
  edge_cases: "_edge",
};

type CalibrationRow = {
  labeledDomain: string;
  question: string;
  pickedDomains: string[];
  topScore: number | null;
  fallbackTriggered: boolean;
  fallbackReason?: string;
  top1Correct: boolean | null;
  inTopK: boolean | null;
  pickDurationMs: number;
};

type CliArgs = {
  threshold: number;
  topK: number;
  limit: number | null;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { threshold: 0.55, topK: 3, limit: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--threshold") args.threshold = parseFloat(argv[++i] ?? "0.55");
    else if (a === "--topK") args.topK = parseInt(argv[++i] ?? "3", 10);
    else if (a === "--limit") args.limit = parseInt(argv[++i] ?? "0", 10);
  }
  return args;
}

function loadQuestions(): Array<{ domain: string; question: string }> {
  const path = resolve(
    process.cwd(),
    "scripts/quality-audit/test-questions.json",
  );
  const raw = JSON.parse(readFileSync(path, "utf-8")) as Record<
    string,
    string[]
  >;
  const out: Array<{ domain: string; question: string }> = [];
  for (const [domain, list] of Object.entries(raw)) {
    for (const q of list) {
      out.push({ domain, question: q });
    }
  }
  return out;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

function isLabelMappable(label: string): boolean {
  // Apenas os 6 dominios MCP "padrao" tem mapeamento direto.
  return !(label in DOMAIN_LABEL_ALIAS);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  let questions = loadQuestions();
  if (args.limit) {
    questions = questions.slice(0, args.limit);
  }
  console.log(`[calibrate] dataset: ${questions.length} perguntas`);
  console.log(
    `[calibrate] settings: threshold=${args.threshold} topK=${args.topK}`,
  );

  const rows: CalibrationRow[] = [];
  let processed = 0;
  for (const q of questions) {
    processed++;
    if (processed % 20 === 0) {
      console.log(`[calibrate] ${processed}/${questions.length}`);
    }
    const decision = await pickDomains(q.question, {
      threshold: args.threshold,
      topK: args.topK,
    });
    const top1 = decision.pickedDomains[0];
    const mappable = isLabelMappable(q.domain);
    const top1Correct = mappable ? top1 === q.domain : null;
    const inTopK = mappable
      ? decision.pickedDomains.includes(q.domain)
      : null;
    rows.push({
      labeledDomain: q.domain,
      question: q.question,
      pickedDomains: decision.pickedDomains,
      topScore: decision.topScore,
      fallbackTriggered: decision.fallback.triggered,
      fallbackReason: decision.fallback.reason,
      top1Correct,
      inTopK,
      pickDurationMs: decision.pickDurationMs,
    });
  }

  // Estatisticas globais.
  const mappableRows = rows.filter((r) => r.top1Correct !== null);
  const top1Acc =
    mappableRows.filter((r) => r.top1Correct).length / Math.max(1, mappableRows.length);
  const topKAcc =
    mappableRows.filter((r) => r.inTopK).length / Math.max(1, mappableRows.length);
  const fallbacks = rows.filter((r) => r.fallbackTriggered).length;
  const durations = rows.map((r) => r.pickDurationMs);
  const dP50 = percentile(durations, 50);
  const dP95 = percentile(durations, 95);
  const dP99 = percentile(durations, 99);

  // Por dominio.
  const perDomain = new Map<
    string,
    { total: number; top1: number; topK: number }
  >();
  for (const r of mappableRows) {
    const agg = perDomain.get(r.labeledDomain) ?? {
      total: 0,
      top1: 0,
      topK: 0,
    };
    agg.total += 1;
    if (r.top1Correct) agg.top1 += 1;
    if (r.inTopK) agg.topK += 1;
    perDomain.set(r.labeledDomain, agg);
  }

  // Discordancias (top-K errado): rows mais relevantes para revisar
  // domain-vocabulary.
  const discordancias = mappableRows
    .filter((r) => !r.inTopK)
    .slice(0, 30);

  // Build markdown report.
  const lines: string[] = [];
  lines.push("# R1 Router de catalogo, relatorio de calibragem");
  lines.push("");
  lines.push(`> Gerado em ${new Date().toISOString()}`);
  lines.push(
    `> Settings: threshold=${args.threshold}, topK=${args.topK}, dataset=${questions.length} perguntas`,
  );
  lines.push("");
  lines.push("## KPIs globais");
  lines.push("");
  lines.push(`- **Top-1 acerto:** ${(top1Acc * 100).toFixed(1)}% (${mappableRows.filter((r) => r.top1Correct).length}/${mappableRows.length})`);
  lines.push(`- **Top-K acerto (label em pickedDomains):** ${(topKAcc * 100).toFixed(1)}% (${mappableRows.filter((r) => r.inTopK).length}/${mappableRows.length})`);
  lines.push(`- **Fallbacks:** ${fallbacks}/${rows.length} (${((fallbacks / Math.max(1, rows.length)) * 100).toFixed(1)}%)`);
  lines.push(`- **Latencia pickDurationMs:** p50=${dP50}ms, p95=${dP95}ms, p99=${dP99}ms`);
  lines.push("");
  lines.push("## Por dominio (so dominios MCP mapeaveis)");
  lines.push("");
  lines.push("| Dominio | Total | Top-1 | Top-K |");
  lines.push("|---|---:|---:|---:|");
  for (const [domain, agg] of Array.from(perDomain.entries()).sort()) {
    const t1 = ((agg.top1 / Math.max(1, agg.total)) * 100).toFixed(1);
    const tK = ((agg.topK / Math.max(1, agg.total)) * 100).toFixed(1);
    lines.push(`| ${domain} | ${agg.total} | ${t1}% | ${tK}% |`);
  }
  lines.push("");
  lines.push("## Discordancias (label fora do top-K) — top 30");
  lines.push("");
  lines.push("Candidatos a ajustar `domain-vocabulary.ts`.");
  lines.push("");
  lines.push("| Label | Pergunta | Picked | TopScore |");
  lines.push("|---|---|---|---:|");
  for (const r of discordancias) {
    const picked = r.pickedDomains.length > 0 ? r.pickedDomains.join(", ") : "(fallback)";
    const top = r.topScore !== null ? r.topScore.toFixed(2) : "n/a";
    const q = r.question.length > 80 ? `${r.question.slice(0, 80)}...` : r.question;
    lines.push(`| ${r.labeledDomain} | ${q.replace(/\|/g, "\\|")} | ${picked} | ${top} |`);
  }
  lines.push("");
  lines.push("## Categorias nao mapeaveis (semanticas, nao de dominio)");
  lines.push("");
  lines.push("- `complexos_e_mistos`, `informais_e_dialeticos`, `edge_cases`");
  lines.push("- Comportamento esperado: variam entre fallback e pickedDomains plausiveis.");
  lines.push(
    "- Nao contam para Top-1 / Top-K accuracy (mappable=false).",
  );

  const reportPath = resolve(
    process.cwd(),
    "docs/router-calibration-r1.md",
  );
  writeFileSync(reportPath, lines.join("\n"));

  console.log("");
  console.log(`[calibrate] Relatorio salvo em ${reportPath}`);
  console.log(`[calibrate] Top-1: ${(top1Acc * 100).toFixed(1)}%`);
  console.log(`[calibrate] Top-K: ${(topKAcc * 100).toFixed(1)}%`);
  console.log(`[calibrate] Fallbacks: ${fallbacks}/${rows.length}`);
  console.log(`[calibrate] p95 latencia: ${dP95}ms`);

  // Critério de promocao do PLAN v3 §11.3: Top-1 >= 85%.
  if (top1Acc >= 0.85) {
    console.log("\n[calibrate] ✓ Top-1 >= 85% — apto para ativacao em painel admin.");
  } else {
    console.log(
      "\n[calibrate] ✗ Top-1 < 85% — ajustar domain-vocabulary.ts e re-rodar.",
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
