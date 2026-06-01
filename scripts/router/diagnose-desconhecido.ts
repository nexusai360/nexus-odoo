#!/usr/bin/env tsx
/** READ-ONLY: investiga _desconhecido e toolsDomains vazio nas decisoes do
 *  periodo da R24 (>= 31/05), por modo. Mostra se sao corrigiveis (tool real
 *  cadastro_* que virou _desconhecido) ou genuinamente sem tool. */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { getToolDomains } from "@/lib/agent/router/tool-to-domain";

async function main() {
  const rows = await prisma.agentRouterDecision.findMany({
    where: { createdAt: { gte: new Date("2026-05-31T00:00:00Z") } },
    select: { mode: true, toolsActuallyUsed: true, toolsDomains: true, userQuestion: true, conversationId: true },
  });
  const byMode: Record<string, { total: number; desconhecido: number; vazio: number; corrigivel: number }> = {};
  for (const r of rows) {
    const m = (byMode[r.mode] ??= { total: 0, desconhecido: 0, vazio: 0, corrigivel: 0 });
    m.total++;
    if (r.toolsActuallyUsed.length === 0) m.vazio++;
    if (r.toolsDomains.includes("_desconhecido")) {
      m.desconhecido++;
      // corrigivel = recomputar com mapeamento atual remove o _desconhecido
      const recomputed = getToolDomains(r.toolsActuallyUsed);
      if (!recomputed.includes("_desconhecido")) m.corrigivel++;
    }
  }
  console.log("=== decisoes >= 31/05 por modo ===");
  for (const [mode, s] of Object.entries(byMode)) {
    console.log(`${mode.padEnd(16)} total=${s.total} | toolsDomains tem _desconhecido=${s.desconhecido} (corrigivel c/ remap=${s.corrigivel}) | toolsActuallyUsed vazio=${s.vazio}`);
  }

  // amostra de _desconhecido com a tool real
  console.log("\n=== amostra _desconhecido (tool real -> remap) ===");
  let shown = 0;
  for (const r of rows) {
    if (!r.toolsDomains.includes("_desconhecido")) continue;
    if (shown++ >= 12) break;
    console.log(`[${r.mode}] tools=[${r.toolsActuallyUsed.join(",")}] -> remap=[${getToolDomains(r.toolsActuallyUsed).join(",")}] | "${r.userQuestion.slice(0,50)}"`);
  }

  // amostra de vazio
  console.log("\n=== amostra toolsActuallyUsed vazio ===");
  shown = 0;
  for (const r of rows) {
    if (r.toolsActuallyUsed.length > 0) continue;
    if (shown++ >= 12) break;
    console.log(`[${r.mode}] conv=${r.conversationId ? "sim" : "NAO"} | "${r.userQuestion.slice(0,55)}"`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
