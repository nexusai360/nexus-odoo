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
import { createDecision } from "@/lib/agent/router/log-decision";
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
  /** Grava 1 AgentRouterDecision por conversa (mode=calibracao_R-X) para
   *  aparecer na tabela Requisicoes do Router no painel de monitoramento. */
  log: boolean;
  /** Antes de gravar, apaga decisoes calibracao_R-X anteriores (idempotente).
   *  So apaga linhas sinteticas DESTE modo, nunca conversas/respostas reais. */
  reset: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    markers: DEFAULT_MARKERS,
    threshold: 0.3,
    topK: 3,
    log: false,
    reset: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--markers") args.markers = (argv[++i] ?? "").split(",").filter(Boolean);
    else if (a === "--threshold") args.threshold = parseFloat(argv[++i] ?? "0.3");
    else if (a === "--topK") args.topK = parseInt(argv[++i] ?? "3", 10);
    else if (a === "--log") args.log = true;
    else if (a === "--reset") args.reset = true;
  }
  return args;
}

const LOG_MODE = "calibracao_R-X" as const;

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

  // Uma "instancia" por conversa (cada conversa daquelas rodadas). Guardamos
  // TODAS (mapeaveis ou nao) para que TODOS os registros aparecam no painel;
  // metricas Top-K usam so as mapeaveis (com dominio esperado).
  type Decision = Awaited<ReturnType<typeof pickDomains>>;
  interface Inst { convId: string; q: string; label: string | null; mappable: boolean }
  const instances: Inst[] = [];
  for (const [convId, content] of firstByConv.entries()) {
    const label = labelOf.get(norm(content)) ?? null;
    instances.push({ convId, q: content, label, mappable: label !== null && isMappable(label) });
  }
  const unlabeled = instances.filter((i) => i.label === null).length;

  // Embedding por pergunta UNICA (todas), com cache da decisao completa.
  const uniqueQs = [...new Set(instances.map((i) => norm(i.q)))];
  const decByQ = new Map<string, Decision>();
  let processed = 0;
  for (const inst of instances) {
    const key = norm(inst.q);
    if (decByQ.has(key)) continue;
    const decision = await pickDomains(inst.q, { threshold: args.threshold, topK: args.topK });
    decByQ.set(key, decision);
    processed++;
    if (processed % 25 === 0) console.log(`[rounds] ${processed}/${uniqueQs.length} perguntas unicas`);
  }
  const pickedOf = (key: string): string[] => {
    const d = decByQ.get(key)!;
    return d.fallback.triggered ? [] : d.pickedDomains;
  };

  // Grava TODOS os registros no painel (1 por conversa), modo calibracao_R-X.
  if (args.log) {
    if (args.reset) {
      const del = await prisma.agentRouterDecision.deleteMany({ where: { mode: LOG_MODE } });
      console.log(`[rounds] --reset: ${del.count} decisoes calibracao_R-X antigas removidas`);
    }
    let persisted = 0, failed = 0;
    for (const inst of instances) {
      const decision = decByQ.get(norm(inst.q))!;
      const res = await createDecision({
        decision,
        mode: LOG_MODE,
        catalogSizeOffered: 0,
        catalogSizeFull: 0,
        userQuestion: inst.q,
        conversationId: inst.convId,
        // Dominio esperado (label da rodada) so para mapeaveis; o painel usa
        // toolsDomains para computar cobertura. Nao-mapeaveis ficam vazios.
        toolsActuallyUsed: inst.mappable ? [inst.label!] : [],
        toolsDomains: inst.mappable ? [inst.label!] : [],
      });
      if (res.persisted) persisted++; else failed++;
      if ((persisted + failed) % 50 === 0) console.log(`[rounds] gravados ${persisted + failed}/${instances.length}`);
    }
    console.log(`[rounds] persistidos ${persisted}/${instances.length} (falhas: ${failed}) no painel (mode=${LOG_MODE})`);
    if (failed > 0) throw new Error(`${failed} registros NAO persistiram no painel`);
  }

  // Metricas Top-K so sobre instancias MAPEAVEIS (com dominio esperado).
  const mappableInsts = instances.filter((i) => i.mappable);
  let instTop1 = 0, instTopK = 0, instFallback = 0;
  for (const inst of mappableInsts) {
    const picked = pickedOf(norm(inst.q));
    if (picked.length === 0) { instFallback++; continue; }
    if (picked[0] === inst.label) instTop1++;
    if (picked.includes(inst.label!)) instTopK++;
  }
  // Por pergunta unica mapeavel.
  const mappableUnique = [...new Set(mappableInsts.map((i) => norm(i.q)))];
  const labelByQ = new Map<string, string>();
  for (const inst of mappableInsts) labelByQ.set(norm(inst.q), inst.label!);
  let uTop1 = 0, uTopK = 0, uFallback = 0;
  for (const key of mappableUnique) {
    const picked = pickedOf(key);
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
  out.push(`> Conversas: ${convs.length} | total instancias: ${instances.length} | instancias mapeaveis: ${mappableInsts.length} | perguntas unicas mapeaveis: ${mappableUnique.length} | sem rotulo: ${unlabeled}`);
  if (args.log) out.push(`> Registros gravados no painel: ${instances.length} (mode=${LOG_MODE})`);
  out.push("");
  out.push("## Acumulado por instancia mapeavel (todas as ocorrencias nas 4 rodadas)");
  out.push(`- **Top-K:** ${pct(instTopK, mappableInsts.length)}% (${instTopK}/${mappableInsts.length})`);
  out.push(`- **Top-1:** ${pct(instTop1, mappableInsts.length)}% (${instTop1}/${mappableInsts.length})`);
  out.push(`- **Fallbacks:** ${instFallback}/${mappableInsts.length} (${pct(instFallback, mappableInsts.length)}%)`);
  out.push("");
  out.push("## Por pergunta unica mapeavel");
  out.push(`- **Top-K:** ${pct(uTopK, mappableUnique.length)}% (${uTopK}/${mappableUnique.length})`);
  out.push(`- **Top-1:** ${pct(uTop1, mappableUnique.length)}% (${uTop1}/${mappableUnique.length})`);
  out.push(`- **Fallbacks:** ${uFallback}/${mappableUnique.length}`);
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
