#!/usr/bin/env tsx
/** Verifica o que a aba Router e o gate de elegibilidade mostram para a R24,
 *  e lista as discordancias reais (furos de roteamento). READ-ONLY. */
import "./load-env";
import { prisma } from "@/lib/prisma";
import {
  getRouterKpis,
  getRouterEligibleToActivate,
  defaultRouterFilter,
} from "@/lib/agent/router/queries";

async function main() {
  const kpis = await getRouterKpis(defaultRouterFilter());
  console.log("=== KPIs (ultimos 7 dias, janela do gate) ===");
  console.log(`total decisoes: ${kpis.totalDecisoes}`);
  console.log(`Top-1: ${kpis.top1AccPct}% | Top-K(allIn): ${kpis.allInTopKPct}% | fallback: ${kpis.fallbackPct}%`);
  console.log(`modos:`, kpis.modeBreakdown);
  const elig = await getRouterEligibleToActivate();
  console.log(`\nElegivel p/ ativar? ${elig.eligible} , ${elig.reason}`);

  // Discordancias da R24 (calibracao_R-X, 05-31+).
  const r24 = await prisma.agentRouterDecision.findMany({
    where: { mode: "calibracao_R-X", createdAt: { gte: new Date("2026-05-31T00:00:00Z") } },
    select: { userQuestion: true, pickedDomains: true, toolsActuallyUsed: true, toolsDomains: true, topScore: true },
    orderBy: { createdAt: "asc" },
  });
  const disc = r24.filter((d) => d.toolsDomains.length > 0 && !d.toolsDomains.some((x) => d.pickedDomains.includes(x)));
  console.log(`\n=== ${disc.length} discordancias R24 (router nao ofertou o dominio realmente usado) ===`);
  // Agrupa por (dominio real -> dominio escolhido top1)
  const pat = new Map<string, number>();
  for (const d of disc) {
    const real = [...new Set(d.toolsDomains)].sort().join("+");
    const picked = d.pickedDomains[0] ?? "(fallback)";
    const key = `real=${real} -> pickou=${picked}`;
    pat.set(key, (pat.get(key) ?? 0) + 1);
  }
  console.log("\nPadroes (real -> escolhido):");
  for (const [k, n] of [...pat.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${n}x  ${k}`);

  console.log("\nExemplos:");
  for (const d of disc.slice(0, 40)) {
    console.log(`  [${d.topScore?.toFixed(2) ?? "fb"}] real=[${d.toolsDomains.join(",")}] picked=[${d.pickedDomains.join(",")}] tools=[${d.toolsActuallyUsed.slice(0, 2).join(",")}] | "${d.userQuestion.slice(0, 70)}"`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
