// scripts/gen-baseline-eliminacao.ts
// One-shot: captura receitaIntragrupoEliminavel por periodo com a marcacao ATUAL
// (ANTES da whitelist da Fase 2.5). E o numero que a whitelist NAO pode reduzir
// (gate S0 na conferencia). Rodar:
//   E2E=1 npx tsx --env-file=.env.local scripts/gen-baseline-eliminacao.ts
import { prisma } from "@/lib/prisma";
import { receitaConsolidada } from "@/lib/metrics/fiscal/receita-consolidada";
import { writeFileSync } from "node:fs";

interface Periodo { rotulo: string; de?: string; ate?: string; }
// Limpa 2026+ T8: o cache so guarda 2026+; periodos pre-2026 sairam (historico no git).
// ATENCAO: rodado ANTES do purge, o ACUMULADO ainda inclui pre-2026 e fixaria um gate
// impossivel. Ordem certa: re-rodar este script DEPOIS do apply do purge (T9), ou usar
// como piso o valor de "2026 (ate jun)" (acumulado pos-corte >= 2026 sempre).
const periodos: Periodo[] = [
  { rotulo: "2026 (ate jun)", de: "2026-01-01", ate: "2026-06-30" },
  { rotulo: "ACUMULADO (pos-corte 2026+)", de: undefined, ate: undefined },
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
