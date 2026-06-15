#!/usr/bin/env tsx
/**
 * Junta os arquivos /tmp/nex-judge-out/judged-*.json (escritos pelos subagentes
 * juízes Opus) num único /tmp/nex-pendentes-judged.json e valida cobertura
 * contra /tmp/nex-pendentes.json (todos os 573 itens precisam de veredito).
 *
 *   npx tsx scripts/quality-audit/assemble-judged.ts
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const DUMP = "/tmp/nex-pendentes.json";
const OUT_DIR = "/tmp/nex-judge-out";
const FINAL = "/tmp/nex-pendentes-judged.json";

const VALID = new Set(["CORRETO", "PARCIAL", "ERRADO", "FORA_DO_ESCOPO", "FALHA_TECNICA"]);
const VOCAB = new Set([
  "resposta_correta", "acerto_estado_vazio", "acerto_clarificacao", "acerto_objetividade",
  "limitacao_real_declarada", "resposta_truncada", "lacuna_prematura", "recusa_indevida",
  "nao_usou_tool", "tool_erro", "dado_inventado", "resposta_crua", "fora_do_escopo",
  "heuristica_incerta",
]);

const wanted = new Set(
  (JSON.parse(readFileSync(DUMP, "utf-8")) as Array<{ id: string }>).map((d) => d.id),
);

const merged: Array<{ id: string; status: string; patterns: string[]; razoes: string }> = [];
const seen = new Set<string>();
const problems: string[] = [];

for (const f of readdirSync(OUT_DIR).filter((f) => /^judged-.*\.json$/.test(f)).sort()) {
  let arr: unknown;
  try {
    arr = JSON.parse(readFileSync(`${OUT_DIR}/${f}`, "utf-8"));
  } catch (e) {
    problems.push(`${f}: JSON invalido (${(e as Error).message})`);
    continue;
  }
  if (!Array.isArray(arr)) {
    problems.push(`${f}: nao e array`);
    continue;
  }
  for (const v of arr as Array<Record<string, unknown>>) {
    const id = String(v.id || "");
    if (!wanted.has(id)) {
      problems.push(`${f}: id desconhecido ${id}`);
      continue;
    }
    if (seen.has(id)) continue;
    if (!VALID.has(String(v.status))) {
      problems.push(`${f}: status invalido ${v.status} (${id})`);
      continue;
    }
    const patterns = Array.isArray(v.patterns) ? (v.patterns as string[]).slice(0, 3) : [];
    const bad = patterns.filter((p) => !VOCAB.has(p));
    if (bad.length) problems.push(`${f}: patterns fora do vocab ${JSON.stringify(bad)} (${id})`);
    seen.add(id);
    merged.push({ id, status: String(v.status), patterns, razoes: String(v.razoes || "") });
  }
}

const missing = [...wanted].filter((id) => !seen.has(id));
writeFileSync(FINAL, JSON.stringify(merged, null, 2));

const byStatus: Record<string, number> = {};
for (const m of merged) byStatus[m.status] = (byStatus[m.status] || 0) + 1;

console.log(`[assemble] ${merged.length}/${wanted.size} vereditos -> ${FINAL}`);
console.log(`[assemble] status:`, JSON.stringify(byStatus));
console.log(`[assemble] faltando: ${missing.length}`);
if (missing.length) console.log(missing.slice(0, 40).join("\n"));
if (problems.length) {
  console.log(`[assemble] PROBLEMAS (${problems.length}):`);
  console.log(problems.slice(0, 40).join("\n"));
}
