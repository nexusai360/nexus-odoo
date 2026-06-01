#!/usr/bin/env tsx
/**
 * PERICIA READ-ONLY: classifica cada marker AUDIT-POS como rodada oficial de
 * backtest (LLM disparado) vs teste/dev, com evidencia dura:
 *  - nº de conversas e perguntas distintas
 *  - quantas conversas tem tool_calls reais (LLM rodou de fato)
 *  - quantas tem avaliacao de qualidade (conversation_quality_evaluations)
 *  - se foi usado pela calibragem do router (calibracao_R-X)
 *  - posicao na numeracao ancorada em R8 = 2026-05-26T17-21-31
 */
import "./load-env";
import { prisma } from "@/lib/prisma";

const R8_MARKER = "[AUDIT-POS-2026-05-26T17-21-31]";

function markerOf(t: string | null): string | null {
  if (!t) return null;
  const i = t.indexOf("[");
  const j = t.indexOf("]");
  return i >= 0 && j >= 0 ? t.slice(i, j + 1) : null;
}

async function main() {
  const convs = await prisma.conversation.findMany({
    where: { title: { startsWith: "[AUDIT-" } },
    select: { id: true, title: true },
  });
  const byMarker = new Map<string, string[]>();
  for (const c of convs) {
    const m = markerOf(c.title);
    if (!m) continue;
    (byMarker.get(m) ?? byMarker.set(m, []).get(m)!).push(c.id);
  }
  const allIds = convs.map((c) => c.id);

  // tool_calls reais por conversa
  const tcRows = await prisma.$queryRaw<Array<{ conversation_id: string }>>`
    SELECT DISTINCT conversation_id FROM messages
    WHERE conversation_id = ANY(${allIds}::uuid[])
      AND role = 'assistant' AND tool_calls IS NOT NULL
      AND jsonb_array_length(tool_calls) > 0
  `;
  const hasTool = new Set(tcRows.map((r) => r.conversation_id));

  // avaliacoes por conversa
  const evRows = await prisma.$queryRaw<Array<{ conversation_id: string; n: bigint }>>`
    SELECT conversation_id, COUNT(*)::bigint AS n
    FROM conversation_quality_evaluations
    WHERE conversation_id = ANY(${allIds}::uuid[])
    GROUP BY conversation_id
  `;
  const evalConvs = new Set(evRows.map((r) => r.conversation_id));

  // calibracao_R-X por conversa
  const calib = await prisma.agentRouterDecision.findMany({
    where: { mode: "calibracao_R-X" },
    select: { conversationId: true },
  });
  const calibConvs = new Set(calib.map((c) => c.conversationId).filter(Boolean) as string[]);

  // perguntas distintas por marker
  const firstQ = await prisma.$queryRaw<Array<{ conversation_id: string; content: string }>>`
    SELECT DISTINCT ON (conversation_id) conversation_id, content
    FROM messages
    WHERE conversation_id = ANY(${allIds}::uuid[]) AND role = 'user'
    ORDER BY conversation_id, created_at ASC
  `;
  const qByConv = new Map(firstQ.map((r) => [r.conversation_id, r.content]));

  const sorted = [...byMarker.keys()].sort();
  const r8Idx = sorted.indexOf(R8_MARKER);

  console.log(`R8 anchor index na ordem cronologica: ${r8Idx} (markers antes dele = pre-R8)`);
  console.log(`\nNOME(ancora R8) | marker | convs | Qdistintas | c/tool | c/eval | c/calib | classe`);
  let idx = 0;
  for (const m of sorted) {
    const ids = byMarker.get(m)!;
    const qset = new Set(ids.map((id) => (qByConv.get(id) ?? "").trim().toLowerCase()).filter(Boolean));
    const nTool = ids.filter((id) => hasTool.has(id)).length;
    const nEval = ids.filter((id) => evalConvs.has(id)).length;
    const nCal = ids.filter((id) => calibConvs.has(id)).length;
    const pos = sorted.indexOf(m) - r8Idx;
    const nome = pos < 0 ? `pre-R8(${pos})` : `R${8 + pos}`;
    const classe = pos < 0 ? "TESTE/DEV (pre-catalogo)" : nEval > 0 ? "RODADA BACKTEST" : nCal > 0 ? "calib router" : "?";
    console.log(
      `${nome.padEnd(12)} | ${m} | ${String(ids.length).padStart(4)} | ${String(qset.size).padStart(4)} | ${String(nTool).padStart(4)} | ${String(nEval).padStart(4)} | ${String(nCal).padStart(4)} | ${classe}`,
    );
    idx++;
  }

  // Foco R24: dedup de reruns
  const r24 = sorted[r8Idx + 16];
  console.log(`\n=== R24 = ${r24} ===`);
  const r24ids = byMarker.get(r24) ?? [];
  const qmap = new Map<string, number>();
  for (const id of r24ids) {
    const q = (qByConv.get(id) ?? "").trim().toLowerCase();
    if (q) qmap.set(q, (qmap.get(q) ?? 0) + 1);
  }
  const dups = [...qmap.values()].filter((n) => n > 1).length;
  console.log(`convs=${r24ids.length} | perguntas distintas=${qmap.size} | perguntas com >1 conversa (reruns)=${dups}`);
  console.log(`convs com tool_calls=${r24ids.filter((id) => hasTool.has(id)).length} | com eval=${r24ids.filter((id) => evalConvs.has(id)).length} | com calib router=${r24ids.filter((id) => calibConvs.has(id)).length}`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
