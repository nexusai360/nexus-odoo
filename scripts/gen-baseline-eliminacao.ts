// scripts/gen-baseline-eliminacao.ts
// One-shot: captura receitaIntragrupoEliminavel por periodo com a marcacao ATUAL
// (ANTES da whitelist da Fase 2.5). E o numero que a whitelist NAO pode reduzir
// (gate S0 na conferencia). Rodar:
//   E2E=1 npx tsx --env-file=.env.local scripts/gen-baseline-eliminacao.ts
import { prisma } from "@/lib/prisma";
import { receitaConsolidada } from "@/lib/metrics/fiscal/receita-consolidada";
import { writeFileSync } from "node:fs";

interface Periodo { rotulo: string; de?: string; ate?: string; }
const periodos: Periodo[] = [
  { rotulo: "2023", de: "2023-01-01", ate: "2023-12-31" },
  { rotulo: "2024", de: "2024-01-01", ate: "2024-12-31" },
  { rotulo: "2025", de: "2025-01-01", ate: "2025-12-31" },
  { rotulo: "2026 (ate jun)", de: "2026-01-01", ate: "2026-06-30" },
  { rotulo: "ACUMULADO (13 anos)", de: undefined, ate: undefined },
];

async function main() {
  if (process.env.E2E !== "1") { console.log("SKIP: defina E2E=1."); return; }
  const out: Record<string, number> = {};
  for (const p of periodos) {
    const rc = await receitaConsolidada(prisma, { periodoDe: p.de, periodoAte: p.ate });
    out[p.rotulo] = rc.receitaIntragrupoEliminavel;
    console.log(`${p.rotulo}: ${rc.receitaIntragrupoEliminavel.toFixed(2)}`);
  }
  writeFileSync(
    "docs/superpowers/research/baseline-eliminacao-pre-whitelist.json",
    JSON.stringify(out, null, 2) + "\n",
  );
  await prisma.$disconnect();
  console.log("OK: baseline gravado.");
}
main().catch((e) => { console.error(e); process.exit(1); });
