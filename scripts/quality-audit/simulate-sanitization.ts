#!/usr/bin/env tsx
/**
 * Simula a sanitização de tool results contra os batches da rodada 4.
 *
 * Lê cada batch em docs/agent-quality-review/batches-pos4/, aplica
 * sanitizeToolResult em cada toolResult, e reporta:
 *   - quantos tool results foram modificados (anexaram _agregado)
 *   - quantos ficaram intactos (não tinham linhas numéricas)
 *   - amostra de antes/depois pra inspeção manual
 *
 * Critério de gate: 100% dos tool results sanitizados continuam JSON
 * válido E o JSON original (sem _agregado) está preservado byte-a-byte
 * exceto pela adição do campo. Se algum quebrar, abortar e investigar.
 *
 * CLI:
 *   pnpm tsx scripts/quality-audit/simulate-sanitization.ts
 */

import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import {
  sanitizeToolResult,
  type SanitizationMode,
} from "../../src/lib/agent/quality/sanitize-tool-result";

const MODE: SanitizationMode = "aggregates_only";
const BATCH_DIR = resolve(
  process.cwd(),
  "docs/agent-quality-review/batches-pos4",
);

interface Stats {
  totalTools: number;
  modified: number;
  intact: number;
  jsonInvalid: number;
  preservationFailed: number;
  modifiedSamples: Array<{ before: string; after: string }>;
  intactSamples: Array<{ raw: string; reason: string }>;
}

function main() {
  const stats: Stats = {
    totalTools: 0,
    modified: 0,
    intact: 0,
    jsonInvalid: 0,
    preservationFailed: 0,
    modifiedSamples: [],
    intactSamples: [],
  };

  const files = readdirSync(BATCH_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  console.log(
    `[simulate] Modo: ${MODE} | Lendo ${files.length} batches em ${BATCH_DIR}\n`,
  );

  for (const file of files) {
    const raw = readFileSync(resolve(BATCH_DIR, file), "utf8");
    const data = JSON.parse(raw) as { turnos?: Array<{ toolResults?: Record<string, unknown> }> };

    for (const turno of data.turnos ?? []) {
      const tr = turno.toolResults;
      if (!tr) continue;

      for (const [callId, result] of Object.entries(tr)) {
        const resultStr =
          typeof result === "string" ? result : JSON.stringify(result);
        stats.totalTools++;

        const sanitized = sanitizeToolResult(resultStr, MODE);

        // Verifica JSON válido pós-sanitização (se modificou).
        if (sanitized !== resultStr) {
          stats.modified++;
          try {
            JSON.parse(sanitized);
          } catch {
            stats.jsonInvalid++;
            console.error(
              `[simulate] JSON inválido após sanitização: callId=${callId}`,
            );
            console.error(`  raw: ${resultStr.slice(0, 200)}`);
            console.error(`  sanitized: ${sanitized.slice(0, 200)}`);
          }

          // Verifica que _agregado foi anexado (preservação dos dados originais).
          try {
            const before = JSON.parse(resultStr);
            const after = JSON.parse(sanitized);
            // _agregado é o único acréscimo permitido em dados.
            const afterDados = { ...(after.dados as Record<string, unknown>) };
            delete afterDados._agregado;
            const beforeDadosStr = JSON.stringify(before.dados);
            const afterDadosStr = JSON.stringify(afterDados);
            if (beforeDadosStr !== afterDadosStr) {
              stats.preservationFailed++;
              console.error(
                `[simulate] PRESERVATION FAIL: callId=${callId}`,
              );
              console.error(`  before.dados: ${beforeDadosStr.slice(0, 300)}`);
              console.error(`  after.dados (sem _agregado): ${afterDadosStr.slice(0, 300)}`);
            }
          } catch {
            // Já contado acima.
          }

          if (stats.modifiedSamples.length < 3) {
            stats.modifiedSamples.push({
              before: resultStr.slice(0, 500),
              after: sanitized.slice(0, 800),
            });
          }
        } else {
          stats.intact++;
          if (stats.intactSamples.length < 5) {
            stats.intactSamples.push({
              raw: resultStr.slice(0, 300),
              reason: deduceIntactReason(resultStr),
            });
          }
        }
      }
    }
  }

  console.log(`=== Resultado ===`);
  console.log(`Total tool results processados: ${stats.totalTools}`);
  console.log(
    `Modificados (anexou _agregado): ${stats.modified} (${pct(stats.modified, stats.totalTools)}%)`,
  );
  console.log(
    `Intactos (sem dados numéricos): ${stats.intact} (${pct(stats.intact, stats.totalTools)}%)`,
  );
  console.log(`\n=== Gate ===`);
  console.log(`JSON inválido após sanitização: ${stats.jsonInvalid}`);
  console.log(`Preservação de dados originais falhou: ${stats.preservationFailed}`);

  const passed = stats.jsonInvalid === 0 && stats.preservationFailed === 0;
  console.log(`\nGate: ${passed ? "✅ PASSOU" : "❌ FALHOU"}`);

  console.log(`\n=== Amostras de tools MODIFICADOS ===`);
  for (let i = 0; i < stats.modifiedSamples.length; i++) {
    console.log(`\n--- Amostra ${i + 1} ---`);
    console.log("BEFORE:", stats.modifiedSamples[i]!.before);
    console.log("AFTER: ", stats.modifiedSamples[i]!.after);
  }

  console.log(`\n=== Amostras de tools INTACTOS (motivo) ===`);
  for (let i = 0; i < stats.intactSamples.length; i++) {
    console.log(
      `\n[${i + 1}] (${stats.intactSamples[i]!.reason}): ${stats.intactSamples[i]!.raw.slice(0, 150)}...`,
    );
  }

  process.exit(passed ? 0 : 1);
}

function pct(part: number, total: number): string {
  if (total === 0) return "0.0";
  return ((part / total) * 100).toFixed(1);
}

function deduceIntactReason(raw: string): string {
  try {
    const p = JSON.parse(raw);
    if (!p.dados) return "sem campo dados";
    if (!Array.isArray(p.dados.linhas)) return "dados.linhas não é array";
    if (p.dados.linhas.length === 0) return "linhas vazias";
    if (typeof p.dados.linhas[0] !== "object") return "linhas não são objetos";
    return "sem campo numérico reconhecido";
  } catch {
    return "JSON inválido (texto livre / erro MCP)";
  }
}

main();
