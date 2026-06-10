// scripts/conferencia-fiscal.ts
// BASE DE CONFERENCIA fiscal: confronta as metricas (TS) contra o dado bruto (SQL
// independente), por ano, e acusa qualquer divergencia. E o "raio-x" de sanidade que
// garante que os numeros de receita sao verdadeiros. Rodar:
//   E2E=1 npx tsx --env-file=.env.local scripts/conferencia-fiscal.ts
// Sai com codigo 1 se algum invariante quebrar (serve de gate).
import { prisma } from "@/lib/prisma";
import { faturamentoPorCfop } from "@/lib/metrics/fiscal/faturamento-por-cfop";
import { receitaConsolidada } from "@/lib/metrics/fiscal/receita-consolidada";
import { Prisma } from "@/generated/prisma/client";

const brl = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
const TOL = 0.5; // meio real de tolerancia (arredondamento)

interface Periodo { rotulo: string; de?: string; ate?: string; }

async function somaBrutoSql(de?: string, ate?: string): Promise<number> {
  // Soma vr_produtos dos itens de saida autorizada (mesma base das metricas), via SQL puro.
  const cond: Prisma.Sql[] = [Prisma.sql`entrada_saida = '1'`, Prisma.sql`situacao_nfe = 'autorizada'`];
  if (de && ate) cond.push(Prisma.sql`data_emissao >= ${`${de}T00:00:00Z`}::timestamptz AND data_emissao < (${`${ate}T00:00:00Z`}::timestamptz + interval '1 day')`);
  const where = Prisma.join(cond, " AND ");
  const rows = await prisma.$queryRaw<Array<{ soma: Prisma.Decimal | null }>>(
    Prisma.sql`SELECT COALESCE(SUM(vr_produtos),0) AS soma FROM fato_nota_fiscal_item WHERE ${where}`,
  );
  return Number(rows[0]?.soma ?? 0);
}

function check(nome: string, a: number, b: number, erros: string[]): void {
  const ok = Math.abs(a - b) <= TOL;
  console.log(`   ${ok ? "OK  " : "XX  "} ${nome}: ${brl(a)} vs ${brl(b)} (dif ${brl(a - b)})`);
  if (!ok) erros.push(nome);
}

async function main() {
  if (process.env.E2E !== "1") { console.log("SKIP: defina E2E=1."); return; }
  const erros: string[] = [];
  const periodos: Periodo[] = [
    { rotulo: "2023", de: "2023-01-01", ate: "2023-12-31" },
    { rotulo: "2024", de: "2024-01-01", ate: "2024-12-31" },
    { rotulo: "2025", de: "2025-01-01", ate: "2025-12-31" },
    { rotulo: "2026 (ate jun)", de: "2026-01-01", ate: "2026-06-30" },
    { rotulo: "ACUMULADO (13 anos)", de: undefined, ate: undefined },
  ];

  for (const p of periodos) {
    console.log(`\n== ${p.rotulo} ==`);
    const f1 = await faturamentoPorCfop(prisma, { agruparPor: "categoria", periodoDe: p.de, periodoAte: p.ate });
    const rc = await receitaConsolidada(prisma, { periodoDe: p.de, periodoAte: p.ate });
    const brutoSql = await somaBrutoSql(p.de, p.ate);

    console.log(`   bruto(produtos)=${brl(f1.totalProdutos)} | receita=${brl(f1.totalReceita)} | nao-receita=${brl(f1.totalNaoReceita)} | semCfop=${brl(f1.semCfop.valorProdutos)}`);
    console.log(`   receita externa=${brl(rc.receitaExterna)} | intragrupo eliminado=${brl(rc.receitaIntragrupoEliminavel)} (${(rc.percentualEliminado * 100).toFixed(1)}%)`);

    // INVARIANTE 1: a base da metrica bate com o dado bruto (SQL independente).
    check("I1 base TS == bruto SQL", f1.totalProdutos, brutoSql, erros);
    // INVARIANTE 2: bruto = receita + nao-receita (decomposicao fechada).
    check("I2 receita+naoReceita == bruto", f1.totalReceita + f1.totalNaoReceita, f1.totalProdutos, erros);
    // INVARIANTE 3: receita individual (F2) == receita total (F1) , reconciliacao cruzada.
    check("I3 F2.individual == F1.receita", rc.receitaIndividualTotal, f1.totalReceita, erros);
    // INVARIANTE 4: receita externa + intragrupo eliminavel == receita individual.
    check("I4 externa+intragrupo == individual", rc.receitaExterna + rc.receitaIntragrupoEliminavel, rc.receitaIndividualTotal, erros);
    // INVARIANTE 5: eliminavel <= bruto intragrupo (nao elimina mais do que existe).
    check("I5 eliminavel <= bruto intragrupo", Math.min(rc.receitaIntragrupoEliminavel, rc.intercompanyBrutoVrProdutos), rc.receitaIntragrupoEliminavel, erros);
  }

  await prisma.$disconnect();
  console.log(`\n${"=".repeat(50)}`);
  if (erros.length) {
    console.error(`FALHOU: ${erros.length} invariante(s) divergiram: ${erros.join("; ")}`);
    process.exitCode = 1;
  } else {
    console.log("TODOS os invariantes fecham. Os numeros de receita sao consistentes com o dado bruto.");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
