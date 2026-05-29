/**
 * R1 router de catalogo: nucleo da calibragem offline contra as perguntas das
 * rodadas historicas R8-R23.
 *
 * Spec: docs/superpowers/specs/2026-05-28-router-catalogo-design.md §10.1.7.
 * Plan: docs/superpowers/plans/2026-05-28-router-catalogo-plan.md §E2 §E4 §G2.
 *
 * NAO chama LLM de chat. Apenas:
 *   1. carrega o dataset oficial em scripts/quality-audit/test-questions.json
 *   2. roda pickDomains contra cada pergunta (embed + cosine)
 *   3. compara dominio rotulado pela bateria vs dominio escolhido pelo router
 *   4. opcionalmente produz docs/router-calibration-r1.md com tabela + KPIs
 *   5. retorna o resultado estruturado (consumido pela CLI e pela rota admin)
 *
 * Custo: ~$0.003 (291 embeddings de pergunta).
 *
 * Este modulo e' o ponto unico de verdade da calibragem. A CLI
 * (scripts/router/calibrate-against-batteries.ts) e a rota admin
 * (src/app/api/admin/router/calibrate/route.ts) ambas chamam runCalibration.
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { pickDomains } from "@/lib/agent/router/pick-domains";
import { ROUTER_PROMOTION_MIN_TOP1 } from "@/lib/agent/router/constants";

// Dominios da bateria que NAO sao dominios do MCP. Sao categorias semanticas.
// Mapeamos para a interpretacao mais razoavel para fim de avaliacao.
export const DOMAIN_LABEL_ALIAS: Record<string, string> = {
  complexos_e_mistos: "_misto",
  informais_e_dialeticos: "_informal",
  edge_cases: "_edge",
};

export interface CalibrationOptions {
  threshold?: number;
  topK?: number;
  limit?: number | null;
  /** Quando false, nao escreve docs/router-calibration-r1.md. Default true. */
  writeReport?: boolean;
  /** Callback de progresso (a cada pergunta processada). */
  onProgress?: (processed: number, total: number) => void;
  /**
   * Quantas perguntas embedar em paralelo. Cada pergunta faz 1 chamada de
   * embedding (~1-3s). Sequencial, 291 perguntas levam minutos e estouram o
   * timeout do handler HTTP. Default 8 (seguro para os limites de RPM de
   * embeddings da OpenAI).
   */
  concurrency?: number;
  /**
   * Quando definido, cada embedding da calibragem vira uma linha de consumo
   * (LlmUsage) com esta origem (ex.: "router_calibracao"). Default: não loga
   * (mantém o histórico de consumo limpo durante o tuning).
   */
  logUsageOrigin?: string;
}

export interface CalibrationDomainStat {
  domain: string;
  total: number;
  top1: number;
  topK: number;
}

export interface CalibrationResult {
  threshold: number;
  topK: number;
  datasetSize: number;
  /** Perguntas com label mapeavel a um dominio MCP (denominador de acuracia). */
  mappableCount: number;
  top1CorrectCount: number;
  topKCorrectCount: number;
  /** Fracao 0..1. */
  top1Accuracy: number;
  /** Fracao 0..1. */
  topKAccuracy: number;
  fallbacks: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  perDomain: CalibrationDomainStat[];
  /** Caminho do relatorio salvo, ou null se writeReport=false / falha de IO. */
  reportPath: string | null;
  /** Criterio de promocao: Top-1 >= meta (95%, ver constants.ts). */
  promotable: boolean;
  /** ISO timestamp de quando a calibragem terminou. */
  generatedAt: string;
}

interface CalibrationRow {
  labeledDomain: string;
  question: string;
  pickedDomains: string[];
  topScore: number | null;
  fallbackTriggered: boolean;
  fallbackReason?: string;
  top1Correct: boolean | null;
  inTopK: boolean | null;
  pickDurationMs: number;
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
  const idx = Math.min(
    sorted.length - 1,
    Math.floor((p / 100) * sorted.length),
  );
  return sorted[idx]!;
}

function isLabelMappable(label: string): boolean {
  // Apenas os dominios MCP "padrao" tem mapeamento direto.
  return !(label in DOMAIN_LABEL_ALIAS);
}

function buildReport(
  result: CalibrationResult,
  discordancias: CalibrationRow[],
): string {
  const lines: string[] = [];
  lines.push("# R1 Router de catalogo, relatorio de calibragem");
  lines.push("");
  lines.push(`> Gerado em ${result.generatedAt}`);
  lines.push(
    `> Settings: threshold=${result.threshold}, topK=${result.topK}, dataset=${result.datasetSize} perguntas`,
  );
  lines.push("");
  lines.push("## KPIs globais");
  lines.push("");
  lines.push(
    `- **Top-1 acerto:** ${(result.top1Accuracy * 100).toFixed(1)}% (${result.top1CorrectCount}/${result.mappableCount})`,
  );
  lines.push(
    `- **Top-K acerto (label em pickedDomains):** ${(result.topKAccuracy * 100).toFixed(1)}% (${result.topKCorrectCount}/${result.mappableCount})`,
  );
  lines.push(
    `- **Fallbacks:** ${result.fallbacks}/${result.datasetSize} (${((result.fallbacks / Math.max(1, result.datasetSize)) * 100).toFixed(1)}%)`,
  );
  lines.push(
    `- **Latencia pickDurationMs:** p50=${result.latencyP50}ms, p95=${result.latencyP95}ms, p99=${result.latencyP99}ms`,
  );
  lines.push("");
  lines.push("## Por dominio (so dominios MCP mapeaveis)");
  lines.push("");
  lines.push("| Dominio | Total | Top-1 | Top-K |");
  lines.push("|---|---:|---:|---:|");
  for (const agg of result.perDomain) {
    const t1 = ((agg.top1 / Math.max(1, agg.total)) * 100).toFixed(1);
    const tK = ((agg.topK / Math.max(1, agg.total)) * 100).toFixed(1);
    lines.push(`| ${agg.domain} | ${agg.total} | ${t1}% | ${tK}% |`);
  }
  lines.push("");
  lines.push("## Discordancias (label fora do top-K), top 30");
  lines.push("");
  lines.push("Candidatos a ajustar `domain-vocabulary.ts`.");
  lines.push("");
  lines.push("| Label | Pergunta | Picked | TopScore |");
  lines.push("|---|---|---|---:|");
  for (const r of discordancias) {
    const picked =
      r.pickedDomains.length > 0 ? r.pickedDomains.join(", ") : "(fallback)";
    const top = r.topScore !== null ? r.topScore.toFixed(2) : "n/a";
    const q =
      r.question.length > 80 ? `${r.question.slice(0, 80)}...` : r.question;
    lines.push(
      `| ${r.labeledDomain} | ${q.replace(/\|/g, "\\|")} | ${picked} | ${top} |`,
    );
  }
  lines.push("");
  lines.push("## Categorias nao mapeaveis (semanticas, nao de dominio)");
  lines.push("");
  lines.push("- `complexos_e_mistos`, `informais_e_dialeticos`, `edge_cases`");
  lines.push(
    "- Comportamento esperado: variam entre fallback e pickedDomains plausiveis.",
  );
  lines.push("- Nao contam para Top-1 / Top-K accuracy (mappable=false).");
  return lines.join("\n");
}

/**
 * Roda a calibragem completa e retorna o resultado estruturado.
 *
 * Pre-requisito: credencial de embedding configurada (AppSetting
 * embedding_credential_id), pois pickDomains gera embeddings via OpenAI.
 */
export async function runCalibration(
  options: CalibrationOptions = {},
): Promise<CalibrationResult> {
  const threshold = options.threshold ?? 0.55;
  const topK = options.topK ?? 3;
  const limit = options.limit ?? null;
  const writeReport = options.writeReport ?? true;
  const concurrency = Math.max(1, options.concurrency ?? 8);

  let questions = loadQuestions();
  if (limit) {
    questions = questions.slice(0, limit);
  }

  // Resultado por indice (preserva determinismo independente da ordem de
  // conclusao). Workers consomem uma fila compartilhada de indices.
  const rows: CalibrationRow[] = new Array(questions.length);
  let next = 0;
  let processed = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= questions.length) return;
      const q = questions[i]!;
      const decision = await pickDomains(
        q.question,
        { threshold, topK },
        options.logUsageOrigin
          ? { origin: options.logUsageOrigin }
          : undefined,
      );
      const top1 = decision.pickedDomains[0];
      const mappable = isLabelMappable(q.domain);
      const top1Correct = mappable ? top1 === q.domain : null;
      const inTopK = mappable
        ? decision.pickedDomains.includes(q.domain)
        : null;
      rows[i] = {
        labeledDomain: q.domain,
        question: q.question,
        pickedDomains: decision.pickedDomains,
        topScore: decision.topScore,
        fallbackTriggered: decision.fallback.triggered,
        fallbackReason: decision.fallback.reason,
        top1Correct,
        inTopK,
        pickDurationMs: decision.pickDurationMs,
      };
      processed++;
      options.onProgress?.(processed, questions.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, questions.length) }, () =>
      worker(),
    ),
  );

  // Estatisticas globais.
  const mappableRows = rows.filter((r) => r.top1Correct !== null);
  const top1CorrectCount = mappableRows.filter((r) => r.top1Correct).length;
  const topKCorrectCount = mappableRows.filter((r) => r.inTopK).length;
  const mappableCount = mappableRows.length;
  const top1Accuracy = top1CorrectCount / Math.max(1, mappableCount);
  const topKAccuracy = topKCorrectCount / Math.max(1, mappableCount);
  const fallbacks = rows.filter((r) => r.fallbackTriggered).length;
  const durations = rows.map((r) => r.pickDurationMs);

  // Por dominio.
  const perDomainMap = new Map<
    string,
    { total: number; top1: number; topK: number }
  >();
  for (const r of mappableRows) {
    const agg = perDomainMap.get(r.labeledDomain) ?? {
      total: 0,
      top1: 0,
      topK: 0,
    };
    agg.total += 1;
    if (r.top1Correct) agg.top1 += 1;
    if (r.inTopK) agg.topK += 1;
    perDomainMap.set(r.labeledDomain, agg);
  }
  const perDomain: CalibrationDomainStat[] = Array.from(perDomainMap.entries())
    .sort()
    .map(([domain, agg]) => ({ domain, ...agg }));

  const result: CalibrationResult = {
    threshold,
    topK,
    datasetSize: questions.length,
    mappableCount,
    top1CorrectCount,
    topKCorrectCount,
    top1Accuracy,
    topKAccuracy,
    fallbacks,
    latencyP50: percentile(durations, 50),
    latencyP95: percentile(durations, 95),
    latencyP99: percentile(durations, 99),
    perDomain,
    reportPath: null,
    promotable: top1Accuracy >= ROUTER_PROMOTION_MIN_TOP1,
    generatedAt: new Date().toISOString(),
  };

  if (writeReport) {
    // Discordancias (top-K errado): rows mais relevantes para revisar
    // domain-vocabulary.
    const discordancias = mappableRows.filter((r) => !r.inTopK).slice(0, 30);
    try {
      const reportPath = resolve(
        process.cwd(),
        "docs/router-calibration-r1.md",
      );
      writeFileSync(reportPath, buildReport(result, discordancias));
      result.reportPath = reportPath;
    } catch {
      // Filesystem read-only (ex.: container de producao). Resultado segue
      // valido sem o arquivo em disco; quem consome usa o objeto retornado.
      result.reportPath = null;
    }
  }

  return result;
}
