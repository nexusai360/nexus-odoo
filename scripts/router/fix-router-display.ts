#!/usr/bin/env tsx
/**
 * Limpa a aba Router: (1) remove as decisoes SHADOW geradas durante a corrida
 * da R24 (duplicavam as calibracao_R-X corrigidas e carregavam _desconhecido/
 * tool vazia do codigo antigo); (2) re-mapeia toolsDomains de TODAS as decisoes
 * a partir do toolsActuallyUsed gravado, com o mapeamento atual (corrige
 * cadastro_* -> cadastros e registrar_lacuna -> dominios-vazios no historico).
 *
 * Idempotente. NAO toca conversas/respostas/avaliacoes reais.
 *   --dry  só relata.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { getToolDomains } from "@/lib/agent/router/tool-to-domain";
import { buildRodadaNamesFromMarkers } from "@/lib/agent/quality/rodada-labels";

const DRY = process.argv.includes("--dry");

async function main() {
  // Resolve conversas da R24.
  const evalMarkers = (await prisma.$queryRaw`
    SELECT DISTINCT substring(c.title from position('[' in c.title) for (position(']' in c.title) - position('[' in c.title) + 1)) AS marker
    FROM conversations c JOIN conversation_quality_evaluations e ON e.conversation_id = c.id
    WHERE c.title LIKE '[AUDIT-%'
  `) as Array<{ marker: string | null }>;
  const nameMap = buildRodadaNamesFromMarkers(
    evalMarkers.map((r) => r.marker).filter((m): m is string => !!m),
  );
  let r24: string | null = null;
  for (const [m, n] of nameMap.entries()) if (n === "Rodada 24") r24 = m;
  if (!r24) throw new Error("R24 nao encontrada");
  const convs = await prisma.conversation.findMany({
    where: { title: { contains: r24.slice(1, -1) } },
    select: { id: true },
  });
  const convIds = convs.map((c) => c.id);

  // (1) Conta shadow do periodo da R24 (serao removidas).
  const shadowR24 = await prisma.agentRouterDecision.count({
    where: { mode: "shadow", conversationId: { in: convIds } },
  });
  console.log(`Shadow ligadas a conversas da R24: ${shadowR24}`);

  if (DRY) {
    const all = await prisma.agentRouterDecision.findMany({
      where: { NOT: { toolsActuallyUsed: { isEmpty: true } } },
      select: { toolsActuallyUsed: true, toolsDomains: true },
    });
    const n = all.filter(
      (d) => JSON.stringify(getToolDomains(d.toolsActuallyUsed)) !== JSON.stringify(d.toolsDomains),
    ).length;
    console.log(`Decisoes a re-mapear (estimativa, inclui shadow a deletar): ${n}`);
    console.log("[DRY] nada alterado.");
    await prisma.$disconnect();
    return;
  }

  // Deleta shadow da R24 PRIMEIRO, depois recalcula o remap sobre o que sobrou.
  const del = await prisma.agentRouterDecision.deleteMany({
    where: { mode: "shadow", conversationId: { in: convIds } },
  });
  console.log(`Removidas ${del.count} decisoes shadow da R24.`);

  const all = await prisma.agentRouterDecision.findMany({
    where: { NOT: { toolsActuallyUsed: { isEmpty: true } } },
    select: { id: true, toolsActuallyUsed: true, toolsDomains: true },
  });
  const toRemap = all.filter(
    (d) => JSON.stringify(getToolDomains(d.toolsActuallyUsed)) !== JSON.stringify(d.toolsDomains),
  );
  console.log(`Decisoes a re-mapear: ${toRemap.length} de ${all.length}`);

  let remapped = 0;
  for (const d of toRemap) {
    await prisma.agentRouterDecision.update({
      where: { id: d.id },
      data: { toolsDomains: getToolDomains(d.toolsActuallyUsed) },
    });
    if (++remapped % 50 === 0) console.log(`  re-mapeadas ${remapped}/${toRemap.length}`);
  }
  console.log(`Re-mapeadas ${remapped} decisoes.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
