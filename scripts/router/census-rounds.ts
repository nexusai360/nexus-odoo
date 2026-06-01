#!/usr/bin/env tsx
/** Censo READ-ONLY: todos os markers, nome canonico, nº de conversas,
 *  e decisoes de router por modo + a qual marker as calibracao_R-X apontam. */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { buildRodadaNamesFromMarkers } from "@/lib/agent/quality/rodada-labels";

function markerOfTitle(t: string | null): string | null {
  if (!t) return null;
  const i = t.indexOf("[");
  const j = t.indexOf("]");
  if (i < 0 || j < 0) return null;
  return t.slice(i, j + 1);
}

async function main() {
  // conv count por marker
  const convs = await prisma.conversation.findMany({
    where: { title: { startsWith: "[AUDIT-" } },
    select: { id: true, title: true },
  });
  const countByMarker = new Map<string, number>();
  const idsByMarker = new Map<string, string[]>();
  for (const c of convs) {
    const m = markerOfTitle(c.title);
    if (!m) continue;
    countByMarker.set(m, (countByMarker.get(m) ?? 0) + 1);
    const arr = idsByMarker.get(m) ?? [];
    arr.push(c.id);
    idsByMarker.set(m, arr);
  }
  const nameMap = buildRodadaNamesFromMarkers([...countByMarker.keys()]);

  console.log(`=== ${countByMarker.size} markers AUDIT ===`);
  const rows = [...countByMarker.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [m, n] of rows) {
    console.log(`${(nameMap.get(m) ?? "?").padEnd(14)} | ${String(n).padStart(4)} convs | ${m}`);
  }

  // decisoes por modo
  const allDec = await prisma.agentRouterDecision.groupBy({
    by: ["mode"],
    _count: { _all: true },
  });
  console.log(`\n=== agent_router_decision por modo ===`);
  for (const d of allDec) console.log(`${d.mode.padEnd(18)} | ${d._count._all}`);

  // calibracao_R-X: a quais markers apontam?
  const calib = await prisma.agentRouterDecision.findMany({
    where: { mode: "calibracao_R-X" },
    select: { conversationId: true },
  });
  const convMarker = new Map<string, string>();
  for (const c of convs) {
    const m = markerOfTitle(c.title);
    if (m) convMarker.set(c.id, m);
  }
  const calibByMarker = new Map<string, number>();
  let semConv = 0;
  for (const d of calib) {
    if (!d.conversationId) { semConv++; continue; }
    const m = convMarker.get(d.conversationId);
    if (!m) { semConv++; continue; }
    calibByMarker.set(m, (calibByMarker.get(m) ?? 0) + 1);
  }
  console.log(`\n=== calibracao_R-X (${calib.length}) por marker da conversa ===`);
  for (const [m, n] of [...calibByMarker.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`${(nameMap.get(m) ?? "?").padEnd(14)} | ${String(n).padStart(4)} | ${m}`);
  }
  console.log(`calibracao_R-X sem conversa AUDIT mapeavel: ${semConv}`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
