#!/usr/bin/env tsx
/**
 * Fatia /tmp/nex-pendentes.json + /tmp/nex-rerun.json em lotes prontos para a
 * PERÍCIA agêntica (um lote por subagente Opus). Cada item do lote já traz a
 * pergunta, a resposta do agente, os toolCalls e o RESULTADO REAL re-executado
 * (rerun) lado a lado, para o juiz comparar contra a verdade do dado.
 *
 *   npx tsx scripts/quality-audit/split-for-judge.ts [tamanhoLote]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const DUMP = "/tmp/nex-pendentes.json";
const RERUN = "/tmp/nex-rerun.json";
const OUT_DIR = "/tmp/nex-judge-batches";
const CAP = 12000; // teto por resultado de rerun (mantém input do agente limitado)

const size = Number(process.argv[2] || "12");
const data = JSON.parse(readFileSync(DUMP, "utf-8")) as Array<Record<string, unknown>>;
const rerun = JSON.parse(readFileSync(RERUN, "utf-8")) as Record<string, Array<{ name: string; args: unknown; ok: boolean; result: unknown }>>;

mkdirSync(OUT_DIR, { recursive: true });

function capResult(r: unknown): unknown {
  const s = JSON.stringify(r);
  if (s.length <= CAP) return r;
  return s.slice(0, CAP) + `\n...[TRUNCADO ${s.length - CAP} chars]`;
}

const slim = data.map((it) => ({
  id: it.id,
  createdAt: it.createdAt,
  question: it.question,
  answer: it.answer,
  toolCalls: ((it.toolCalls as Array<{ name?: string; arguments?: unknown }>) || []).map((tc) => ({
    name: tc.name,
    arguments: tc.arguments,
  })),
  rerunReal: (rerun[it.id as string] || []).map((r) => ({
    name: r.name,
    args: r.args,
    ok: r.ok,
    result: capResult(r.result),
  })),
  userFeedback: it.userFeedback,
}));

let n = 0;
for (let i = 0; i < slim.length; i += size) {
  const batch = slim.slice(i, i + size);
  const idx = String(n).padStart(2, "0");
  writeFileSync(`${OUT_DIR}/batch-${idx}.json`, JSON.stringify(batch, null, 2));
  n++;
}
console.log(`[split] ${slim.length} itens -> ${n} lotes de ate ${size} em ${OUT_DIR}`);
