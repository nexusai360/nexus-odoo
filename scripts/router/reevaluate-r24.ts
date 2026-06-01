#!/usr/bin/env tsx
/**
 * Reavaliacao da R24 na aba Router, com VERDADE-BASE REAL.
 *
 * Contexto (pericia 2026-06-01): a R24 (rodada de backtest de 31/05, marker
 * 2026-05-31T18-18-13, 388 conversas = 291 perguntas + 97 reruns de quota) NAO
 * tinha nenhuma decisao de router registrada (a aba Router mostrava so dado
 * velho de R20-R23, com vocab antigo 048ea0d2 e avaliacao por label do
 * test-questions.json, que fabricava concordancia em dominios novos).
 *
 * Este script cria 1 AgentRouterDecision (mode=calibracao_R-X) por pergunta
 * UNICA da R24, com:
 *   - pickedDomains: re-rodando pickDomains com o VOCAB ATUAL (aefb1bb6) e o
 *     threshold/topK das settings de producao.
 *   - toolsActuallyUsed/toolsDomains: as tools que o agente DE FATO chamou
 *     naquela conversa (messages.tool_calls) = verdade-base honesta. discordante
 *     passa a significar "o router nao ofereceu o dominio que foi realmente
 *     usado".
 *
 * Idempotente: apaga as decisoes calibracao_R-X ja ligadas a conversas da R24
 * antes de recriar. NAO toca conversas/respostas/avaliacoes reais nem decisoes
 * de outras rodadas.
 *
 * Uso:
 *   tsx scripts/router/reevaluate-r24.ts            # grava
 *   tsx scripts/router/reevaluate-r24.ts --dry      # so relatorio, nao grava
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { pickDomains } from "@/lib/agent/router/pick-domains";
import { getToolDomains } from "@/lib/agent/router/tool-to-domain";
import { buildRodadaNamesFromMarkers } from "@/lib/agent/quality/rodada-labels";

const DRY = process.argv.includes("--dry");
const LOG_MODE = "calibracao_R-X";

function markerOf(t: string | null): string | null {
  if (!t) return null;
  const i = t.indexOf("[");
  const j = t.indexOf("]");
  return i >= 0 && j >= 0 ? t.slice(i, j + 1) : null;
}
function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

async function main() {
  // 1. Resolve o marker da R24 via numeracao canonica (ancorada em R8).
  const evalMarkers = (await prisma.$queryRaw`
    SELECT DISTINCT substring(c.title from position('[' in c.title) for (position(']' in c.title) - position('[' in c.title) + 1)) AS marker
    FROM conversations c
    JOIN conversation_quality_evaluations e ON e.conversation_id = c.id
    WHERE c.title LIKE '[AUDIT-%'
  `) as Array<{ marker: string | null }>;
  const markers = evalMarkers.map((r) => r.marker).filter((m): m is string => !!m);
  const nameMap = buildRodadaNamesFromMarkers(markers);
  let r24: string | null = null;
  for (const [m, n] of nameMap.entries()) if (n === "Rodada 24") r24 = m;
  if (!r24) throw new Error("Nao encontrei a Rodada 24 entre os markers com avaliacao");
  console.log(`R24 marker = ${r24}`);

  // 2. Conversas da R24 (+ 1a pergunta, createdAt, tem avaliacao?).
  const convs = await prisma.conversation.findMany({
    where: { title: { contains: r24.slice(1, -1) } },
    select: { id: true, createdAt: true },
  });
  const convIds = convs.map((c) => c.id);
  const createdAtById = new Map(convs.map((c) => [c.id, c.createdAt]));

  const userMsgs = await prisma.$queryRaw<
    Array<{ conversation_id: string; content: string; created_at: Date }>
  >`
    SELECT DISTINCT ON (conversation_id) conversation_id, content, created_at
    FROM messages
    WHERE conversation_id = ANY(${convIds}::uuid[]) AND role = 'user'
    ORDER BY conversation_id, created_at ASC
  `;
  const firstQById = new Map(userMsgs.map((m) => [m.conversation_id, m.content]));

  const evalRows = await prisma.$queryRaw<Array<{ conversation_id: string }>>`
    SELECT DISTINCT conversation_id FROM conversation_quality_evaluations
    WHERE conversation_id = ANY(${convIds}::uuid[])
  `;
  const hasEval = new Set(evalRows.map((r) => r.conversation_id));

  // tools reais por conversa (todas as assistant messages com tool_calls).
  const toolRows = await prisma.$queryRaw<
    Array<{ conversation_id: string; tool_calls: unknown }>
  >`
    SELECT conversation_id, tool_calls FROM messages
    WHERE conversation_id = ANY(${convIds}::uuid[]) AND role='assistant' AND tool_calls IS NOT NULL
  `;
  const toolsByConv = new Map<string, Set<string>>();
  for (const r of toolRows) {
    if (!Array.isArray(r.tool_calls)) continue;
    const set = toolsByConv.get(r.conversation_id) ?? new Set<string>();
    for (const c of r.tool_calls as Array<{ name?: string }>) if (c?.name) set.add(c.name);
    toolsByConv.set(r.conversation_id, set);
  }

  // 3. Dedup por pergunta normalizada. Preferencia: conv com avaliacao > com
  //    tool_calls > mais recente. (Remove os 97 reruns de quota.)
  const byQ = new Map<string, string[]>();
  for (const id of convIds) {
    const q = norm(firstQById.get(id) ?? "");
    if (!q) continue;
    (byQ.get(q) ?? byQ.set(q, []).get(q)!).push(id);
  }
  // Verdade-base por pergunta = UNIAO das tools usadas em TODAS as conversas
  // daquela pergunta (inclui reruns). Evita falso "-" quando a conversa
  // canonica (avaliada) nao usou tool mas um rerun usou. So fica vazio quando
  // NENHUMA execucao da pergunta usou tool (saudacao/trivial).
  const toolsByQuestion = new Map<string, Set<string>>();
  for (const [q, ids] of byQ.entries()) {
    const set = new Set<string>();
    for (const id of ids) for (const t of toolsByConv.get(id) ?? []) set.add(t);
    toolsByQuestion.set(q, set);
  }
  const canonical: Array<{ convId: string; q: string; qNorm: string }> = [];
  for (const [q, ids] of byQ.entries()) {
    const best = ids.sort((a, b) => {
      const ea = hasEval.has(a) ? 1 : 0, eb = hasEval.has(b) ? 1 : 0;
      if (ea !== eb) return eb - ea;
      const ta = (toolsByConv.get(a)?.size ?? 0) > 0 ? 1 : 0;
      const tb = (toolsByConv.get(b)?.size ?? 0) > 0 ? 1 : 0;
      if (ta !== tb) return tb - ta;
      return (createdAtById.get(b)?.getTime() ?? 0) - (createdAtById.get(a)?.getTime() ?? 0);
    })[0];
    canonical.push({ convId: best, q: firstQById.get(best) ?? q, qNorm: q });
  }
  console.log(`Conversas R24: ${convIds.length} | perguntas unicas (canonicas): ${canonical.length}`);

  // 4. Settings de producao (threshold/topK) para o pick.
  const settings = await prisma.agentSettings.findFirst({
    select: { routerThreshold: true, routerTopK: true },
  });
  const threshold = settings?.routerThreshold ?? 0.55;
  const topK = settings?.routerTopK ?? 3;
  console.log(`Settings router: threshold=${threshold} topK=${topK}`);

  // 5. Pick por pergunta unica + verdade-base real.
  let top1 = 0, topKhit = 0, fallback = 0, discord = 0, semTool = 0, processed = 0;
  const toCreate: Array<{
    convId: string; q: string; decision: Awaited<ReturnType<typeof pickDomains>>;
    realTools: string[]; realDomains: string[];
  }> = [];
  for (const { convId, q, qNorm } of canonical) {
    let decision = await pickDomains(q, { threshold, topK });
    // Retry 1x em timeout de embed: nao queremos artefato de latencia no dado.
    if (decision.fallback.triggered && decision.fallback.reason === "embed_failed") {
      decision = await pickDomains(q, { threshold, topK });
    }
    const realTools = [...(toolsByQuestion.get(qNorm) ?? new Set<string>())];
    const realDomains = realTools.length > 0 ? [...new Set(getToolDomains(realTools))] : [];
    toCreate.push({ convId, q, decision, realTools, realDomains });

    if (realDomains.length === 0) semTool++;
    if (decision.fallback.triggered) fallback++;
    if (realDomains.length > 0) {
      const picked = decision.pickedDomains;
      if (picked[0] && realDomains.includes(picked[0])) top1++;
      if (realDomains.every((d) => picked.includes(d))) topKhit++;
      if (!realDomains.some((d) => picked.includes(d))) discord++;
    }
    if (++processed % 50 === 0) console.log(`  pick ${processed}/${canonical.length}`);
  }

  const comTool = canonical.length - semTool;
  const pct = (n: number) => ((n / Math.max(1, comTool)) * 100).toFixed(1);
  console.log(`\n=== R24 reavaliada (verdade-base = tools reais) ===`);
  console.log(`Perguntas: ${canonical.length} | com tool real: ${comTool} | sem tool (so texto): ${semTool}`);
  console.log(`Top-1 (router top domain foi usado): ${top1}/${comTool} = ${pct(top1)}%`);
  console.log(`Top-K (TODOS dominios usados ofertados): ${topKhit}/${comTool} = ${pct(topKhit)}%`);
  console.log(`Discordantes (nenhum dominio usado ofertado): ${discord}/${comTool} = ${pct(discord)}%`);
  console.log(`Fallbacks do router: ${fallback}/${canonical.length}`);

  if (DRY) {
    console.log(`\n[DRY] nada gravado.`);
    await prisma.$disconnect();
    return;
  }

  // 6. Idempotente: apaga calibracao_R-X ja ligadas a conversas da R24.
  const del = await prisma.agentRouterDecision.deleteMany({
    where: { mode: LOG_MODE, conversationId: { in: convIds } },
  });
  console.log(`\nApagadas ${del.count} decisoes calibracao_R-X antigas da R24.`);

  let created = 0;
  for (const it of toCreate) {
    await prisma.agentRouterDecision.create({
      data: {
        createdAt: createdAtById.get(it.convId) ?? undefined,
        userQuestion: it.q,
        pickedDomains: it.decision.pickedDomains,
        scores: it.decision.scores,
        topScore: it.decision.topScore,
        fallbackTriggered: it.decision.fallback.triggered,
        fallbackReason: it.decision.fallback.reason ?? null,
        routerVersion: it.decision.routerVersion,
        mode: LOG_MODE,
        catalogSizeOffered: 0,
        catalogSizeFull: 0,
        toolsActuallyUsed: it.realTools,
        toolsDomains: it.realDomains,
        pickDurationMs: it.decision.pickDurationMs,
        conversationId: it.convId,
      },
    });
    if (++created % 50 === 0) console.log(`  gravadas ${created}/${toCreate.length}`);
  }
  console.log(`Gravadas ${created} decisoes calibracao_R-X para a R24.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
