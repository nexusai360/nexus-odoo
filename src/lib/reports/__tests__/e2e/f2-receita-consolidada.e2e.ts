// src/lib/reports/__tests__/e2e/f2-receita-consolidada.e2e.ts
// E2E real da Fase 2. Rodar: E2E=1 npx tsx --env-file=.env.local src/lib/reports/__tests__/e2e/f2-receita-consolidada.e2e.ts
import { prisma } from "@/lib/prisma";
import { receitaConsolidada } from "@/lib/metrics/fiscal/receita-consolidada";
import { matrizIntercompany } from "@/lib/metrics/fiscal/matriz-intercompany";
import { faturamentoPorCfop } from "@/lib/metrics/fiscal/faturamento-por-cfop";

function check(c: boolean, m: string, e: string[]) { if (c) console.log(`OK ${m}`); else { console.error(`FALHOU ${m}`); e.push(m); } }
const brl = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

async function main() {
  if (process.env.E2E !== "1") { console.log("SKIP: defina E2E=1."); return; }
  const erros: string[] = [];

  const r = await receitaConsolidada(prisma, {});
  const f1 = await faturamentoPorCfop(prisma, { agruparPor: "categoria" });
  console.log(`receitaExterna           = ${brl(r.receitaExterna)}`);
  console.log(`receitaIntragrupoElimin. = ${brl(r.receitaIntragrupoEliminavel)} (${(r.percentualEliminado * 100).toFixed(1)}%)`);
  console.log(`receitaIndividualTotal   = ${brl(r.receitaIndividualTotal)}`);
  console.log(`intercompanyBrutoProd.   = ${brl(r.intercompanyBrutoVrProdutos)}`);
  console.log(`notas intra/ext          = ${r.notasIntragrupo} / ${r.notasExternas}`);
  console.log(`F1 totalReceita          = ${brl(f1.totalReceita)}`);

  check(r.receitaExterna > 0, "receitaExterna > 0", erros);
  check(Math.abs(r.receitaExterna + r.receitaIntragrupoEliminavel - r.receitaIndividualTotal) < 1, "externa + eliminavel == individual", erros);
  check(Math.abs(r.receitaIndividualTotal - f1.totalReceita) < 1, "receitaIndividualTotal == F1.totalReceita (reconciliacao)", erros);
  check(r.receitaIntragrupoEliminavel <= r.intercompanyBrutoVrProdutos, "eliminavel <= bruto intragrupo", erros);
  check(r.receitaExterna < r.receitaIndividualTotal, "receita externa menor que individual (houve eliminacao)", erros);
  // B2: travar valores absolutos em banda larga (absorve o ajuste do B1 ~R$40mi no bruto).
  const banda = (v: number, alvo: number, tol: number, nome: string) => check(Math.abs(v - alvo) < tol, `${nome} ~ ${alvo.toLocaleString("pt-BR")} (real ${v.toLocaleString("pt-BR")})`, erros);
  banda(r.receitaExterna, 897_000_000, 5_000_000, "receitaExterna");
  banda(r.receitaIntragrupoEliminavel, 418_600_000, 5_000_000, "receitaIntragrupoEliminavel");
  banda(r.intercompanyBrutoVrProdutos, 700_000_000, 50_000_000, "intercompanyBruto");
  check(r.notasIntragrupo >= 6000 && r.notasIntragrupo <= 6600, `notas intragrupo na banda 6000-6600 (real ${r.notasIntragrupo})`, erros);

  const m = await matrizIntercompany(prisma, {});
  console.log(`matriz: ${m.totalPares} pares, total ${brl(m.total)}`);
  check(m.totalPares > 0, "matriz tem pares intragrupo", erros);
  check(m.linhas.every((l) => l.valor > 0), "todas as linhas da matriz tem valor positivo", erros);

  await prisma.$disconnect();
  if (erros.length) { console.error(`\n${erros.length} falha(s).`); process.exitCode = 1; }
  else console.log(`\nTODAS as verificacoes E2E passaram.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
