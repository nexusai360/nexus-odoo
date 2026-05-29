#!/usr/bin/env tsx
/**
 * R1 router: calibragem de embedding ACUMULADA sobre as perguntas REAIS de um
 * conjunto de rodadas de auditoria (nao o anchor set estatico).
 *
 * Diferente de calibrate-against-batteries.ts (que roda sobre o
 * test-questions.json fixo), este script:
 *   1. recebe os markers das rodadas (ex.: R20-R23);
 *   2. coleta a 1a pergunta de usuario de cada conversa daquelas rodadas;
 *   3. casa cada pergunta com o rotulo de dominio do anchor set (test-questions.json);
 *   4. roda SO o embedding (pickDomains) em cada pergunta unica mapeavel;
 *   5. reporta Top-1 / Top-K acumulado, ponderado por instancia (cada vez que a
 *      pergunta apareceu numa rodada conta) e tambem por pergunta unica.
 *
 * NAO chama LLM de chat, NAO dispara o agente, NAO grava decisao no painel.
 * Custo: ~1 embedding por pergunta unica mapeavel (cache LRU reaproveita).
 *
 * Uso:
 *   tsx scripts/router/calibrate-rounds.ts                      # default R20-R23
 *   tsx scripts/router/calibrate-rounds.ts --markers ts1,ts2    # markers AUDIT-POS explicitos
 *   tsx scripts/router/calibrate-rounds.ts --threshold 0.30 --topK 3
 */

// Primeiro import: carrega .env.local antes de @/lib/prisma (ver load-env.ts).
import "./load-env";

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { prisma } from "@/lib/prisma";
import { pickDomains } from "@/lib/agent/router/pick-domains";
import { DOMAIN_LABEL_ALIAS } from "@/lib/agent/router/calibrate";

// R20-R23 na numeracao real do time (legacy-forward). R23 = bateria de 291
// (baseline 95,5%, marker 2026-05-28T10-12-30, ver r23-relatorio.md).
const DEFAULT_MARKERS = [
  "2026-05-27T22-43-15", // R20
  "2026-05-28T02-43-02", // R21
  "2026-05-28T03-20-54", // R22
  "2026-05-28T10-12-30", // R23
];

interface Args {
  markers: string[];
  threshold: number;
  topK: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { markers: DEFAULT_MARKERS, threshold: 0.3, topK: 3 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--markers") args.markers = (argv[++i] ?? "").split(",").filter(Boolean);
    else if (a === "--threshold") args.threshold = parseFloat(argv[++i] ?? "0.3");
    else if (a === "--topK") args.topK = parseInt(argv[++i] ?? "3", 10);
  }
  return args;
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function isMappable(label: string): boolean {
  return !(label in DOMAIN_LABEL_ALIAS);
}

function loadLabelMap(): Map<string, string> {
  const raw = JSON.parse(
    readFileSync(resolve(process.cwd(), "scripts/quality-audit/test-questions.json"), "utf-8"),
  ) as Record<string, string[]>;
  const map = new Map<string, string>();
  for (const [dom, list] of Object.entries(raw)) {
    for (const q of list) map.set(norm(q), dom);
  }
  return map;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const labelOf = loadLabelMap();

  // Conversas das rodadas-alvo.
  const orFilters = args.markers.map((ts) => ({
    title: { contains: `AUDIT-POS-${ts}` },
  }));
  const convs = await prisma.conversation.findMany({
    where: { OR: orFilters },
    select: { id: true, title: true },
  });
  const ids = convs.map((c) => c.id);

  // 1a pergunta de usuario por conversa.
  const msgs = await prisma.message.findMany({
    where: { conversationId: { in: ids }, role: "user" },
    select: { conversationId: true, content: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const firstByConv = new Map<string, string>();
  for (const m of msgs) {
    if (!firstByConv.has(m.conversationId)) firstByConv.set(m.conversationId, m.content);
  }

  // Instancias (cada conversa = 1 instancia) com rotulo, so mapeaveis.
  interface Inst { q: string; label: string }
  const instances: Inst[] = [];
  let unlabeled = 0;
  for (const content of firstByConv.values()) {
    const label = labelOf.get(norm(content));
    if (!label) { unlabeled++; continue; }
    if (!isMappable(label)) continue; // categorias semanticas nao contam
    instances.push({ q: content, label });
  }

  // Perguntas unicas mapeaveis -> 1 embedding cada.
  const uniqueQs = [...new Set(instances.map((i) => norm(i.q)))];
  const pickByQ = new Map<string, string[]>(); // norm(q) -> pickedDomains
  let processed = 0;
  for (const inst of instances) {
    const key = norm(inst.q);
    if (pickByQ.has(key)) continue;
    const decision = await pickDomains(inst.q, { threshold: args.threshold, topK: args.topK });
    pickByQ.set(key, decision.fallback.triggered ? [] : decision.pickedDomains);
    processed++;
    if (processed % 25 === 0) console.log(`[rounds] ${processed}/${uniqueQs.length} perguntas unicas`);
  }

  // Acumulado por INSTANCIA (faithful ao pedido: todas as perguntas das rodadas).
  let instTop1 = 0, instTopK = 0, instFallback = 0;
  for (const inst of instances) {
    const picked = pickByQ.get(norm(inst.q))!;
    if (picked.length === 0) { instFallback++; continue; }
    if (picked[0] === inst.label) instTop1++;
    if (picked.includes(inst.label)) instTopK++;
  }
  // Por pergunta unica.
  let uTop1 = 0, uTopK = 0, uFallback = 0;
  const labelByQ = new Map<string, string>();
  for (const inst of instances) labelByQ.set(norm(inst.q), inst.label);
  for (const key of uniqueQs) {
    const picked = pickByQ.get(key)!;
    const label = labelByQ.get(key)!;
    if (picked.length === 0) { uFallback++; continue; }
    if (picked[0] === label) uTop1++;
    if (picked.includes(label)) uTopK++;
  }

  const pct = (n: number, d: number) => ((n / Math.max(1, d)) * 100).toFixed(1);
  const out: string[] = [];
  out.push("# R1 Router, calibragem ACUMULADA R20-R23 (perguntas reais)");
  out.push("");
  out.push(`> Rodadas (markers): ${args.markers.join(", ")}`);
  out.push(`> Settings: threshold=${args.threshold}, topK=${args.topK}`);
  out.push(`> Conversas: ${convs.length} | instancias mapeaveis: ${instances.length} | perguntas unicas mapeaveis: ${uniqueQs.length} | sem rotulo: ${unlabeled}`);
  out.push("");
  out.push("## Acumulado por instancia (todas as ocorrencias nas 4 rodadas)");
  out.push(`- **Top-K:** ${pct(instTopK, instances.length)}% (${instTopK}/${instances.length})`);
  out.push(`- **Top-1:** ${pct(instTop1, instances.length)}% (${instTop1}/${instances.length})`);
  out.push(`- **Fallbacks:** ${instFallback}/${instances.length} (${pct(instFallback, instances.length)}%)`);
  out.push("");
  out.push("## Por pergunta unica");
  out.push(`- **Top-K:** ${pct(uTopK, uniqueQs.length)}% (${uTopK}/${uniqueQs.length})`);
  out.push(`- **Top-1:** ${pct(uTop1, uniqueQs.length)}% (${uTop1}/${uniqueQs.length})`);
  out.push(`- **Fallbacks:** ${uFallback}/${uniqueQs.length}`);
  const report = out.join("\n");

  console.log("\n" + report + "\n");
  const path = resolve(process.cwd(), "docs/router-calibration-r20-r23.md");
  writeFileSync(path, report + "\n");
  console.log(`[rounds] relatorio salvo em ${path}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("[rounds] ERRO:", e);
  process.exit(1);
});
