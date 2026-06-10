#!/usr/bin/env tsx
/**
 * E2E (dado real) da Fase 5: faturamento por regime tributario. Trava as invariantes
 * de reconciliacao contra `receitaConsolidada` (mesma base canonica) e a cobertura.
 *
 *   npx tsx --env-file=.env.local src/lib/reports/__tests__/e2e/f5-regime.e2e.ts
 *
 * Pre-requisito: dim_empresa_regime populado (scripts/build-dim-empresa-regime.ts).
 */
import { prisma } from "@/lib/prisma";
import { faturamentoPorRegime } from "@/lib/metrics/fiscal/faturamento-por-regime";
import { receitaConsolidada } from "@/lib/metrics/fiscal/receita-consolidada";

const CENT = 0.01;
let falhas = 0;
function check(nome: string, cond: boolean, detalhe = "") {
  if (cond) {
    console.log(`  OK   ${nome}`);
  } else {
    console.error(`  FALHA ${nome} ${detalhe}`);
    falhas++;
  }
}

async function run(label: string, input: object) {
  console.log(`\n=== ${label} ===`);
  const reg = await faturamentoPorRegime(prisma, input);
  const rc = await receitaConsolidada(prisma, input);
  const sInd = reg.regimes.reduce((s, x) => s + x.receitaIndividual, 0);
  const sExt = reg.regimes.reduce((s, x) => s + x.receitaExterna, 0);

  check("reconcilia individual == receitaConsolidada.receitaIndividualTotal",
    Math.abs(sInd - rc.receitaIndividualTotal) < CENT,
    `(${sInd} vs ${rc.receitaIndividualTotal})`);
  check("reconcilia externa == receitaConsolidada.receitaExterna",
    Math.abs(sExt - rc.receitaExterna) < CENT,
    `(${sExt} vs ${rc.receitaExterna})`);
  check("Sigma dos totais bate com totalReceita* da metrica",
    Math.abs(sInd - reg.totalReceitaIndividual) < CENT &&
      Math.abs(sExt - reg.totalReceitaExterna) < CENT);
  check("cobertura por valor >= 99.5%", reg.coberturaPercentual >= 0.995,
    `(cobertura=${(reg.coberturaPercentual * 100).toFixed(2)}%)`);
  check("regimeSnapshotAtual sinalizado", reg.regimeSnapshotAtual === true);
  check("externa <= individual em cada regime (intragrupo nunca aumenta)",
    reg.regimes.every((r) => r.receitaExterna <= r.receitaIndividual + CENT));
}

async function main() {
  await run("2025", { periodoDe: "2025-01-01", periodoAte: "2025-12-31" });
  await run("TODO O PERIODO", {});
  await prisma.$disconnect();
  if (falhas > 0) {
    console.error(`\nE2E F5 FALHOU: ${falhas} invariante(s).`);
    process.exit(1);
  }
  console.log("\nE2E F5 OK , todas as invariantes verdes.");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
