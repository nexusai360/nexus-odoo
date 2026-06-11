/**
 * scripts/e2e-financeiro-aberto.ts
 *
 * E2E contra o cache real: chama as queries de título (contas a pagar/receber/
 * vencidos) com o novo critério vrSaldo>0 + quebra, e confronta com SQL
 * independente direto no Postgres. Regra de raiz #6 (verificação).
 *
 * Uso: tsx --env-file=.env.local scripts/e2e-financeiro-aberto.ts
 */
import { prisma } from "@/lib/prisma";
import {
  queryContasAReceber,
  queryContasAPagar,
  queryTitulosVencidos,
} from "@/lib/reports/queries/financeiro";

const fmt = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const close = (a: number, b: number) => Math.abs(a - b) < 0.5;

async function main() {
  const hoje = new Date();

  // --- ground truth via SQL independente ---
  const sql = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`
    SELECT tipo,
      round(sum(vr_saldo) FILTER (WHERE vr_saldo>0),2) aberto_total,
      round(sum(vr_saldo) FILTER (WHERE vr_saldo>0 AND situacao_simples='aberto'),2) confirmado,
      round(sum(vr_saldo) FILTER (WHERE vr_saldo>0 AND situacao_simples='provisorio'),2) provisorio,
      round(sum(vr_saldo) FILTER (WHERE vr_saldo>0 AND data_vencimento < date_trunc('day', now())),2) vencido
    FROM fato_financeiro_titulo GROUP BY tipo ORDER BY tipo;
  `);
  const g: Record<string, Record<string, unknown>> = {};
  for (const r of sql) g[String(r.tipo)] = r;

  const pagar = await queryContasAPagar(prisma as never, {}, hoje);
  const receber = await queryContasAReceber(prisma as never, {}, hoje);
  const vencidos = await queryTitulosVencidos(prisma as never, hoje);

  const checks: { nome: string; tool: number; sql: number; ok: boolean }[] = [];
  const push = (nome: string, tool: number, s: number) =>
    checks.push({ nome, tool, sql: s, ok: close(tool, s) });

  push("a_pagar total aberto", pagar.totalAPagar, Number(g.a_pagar.aberto_total));
  push("a_pagar confirmado", pagar.quebra.confirmado, Number(g.a_pagar.confirmado));
  push("a_pagar provisorio", pagar.quebra.provisorio, Number(g.a_pagar.provisorio));
  push("a_receber total aberto", receber.totalAReceber, Number(g.a_receber.aberto_total));
  push("a_receber confirmado", receber.quebra.confirmado, Number(g.a_receber.confirmado));
  push("a_receber provisorio", receber.quebra.provisorio, Number(g.a_receber.provisorio));

  const vencidoSqlTotal = Number(g.a_pagar.vencido) + Number(g.a_receber.vencido);
  push("vencido total (todos)", vencidos.totalVencido, vencidoSqlTotal);

  for (const c of checks) {
    console.log(`${c.ok ? "OK " : "XX "} ${c.nome.padEnd(26)} tool=${fmt(c.tool)}  sql=${fmt(c.sql)}`);
  }
  const allOk = checks.every((c) => c.ok);
  console.log(`\n=== ${allOk ? "TODOS RECONCILIAM" : "DIVERGENCIA!"} ===`);
  console.log(`a_pagar em aberto: ${fmt(pagar.totalAPagar)} (confirmado ${fmt(pagar.quebra.confirmado)} + provisorio ${fmt(pagar.quebra.provisorio)}), ${pagar.titulos.length} titulos`);
  console.log(`a_receber em aberto: ${fmt(receber.totalAReceber)}, ${receber.titulos.length} titulos`);

  await prisma.$disconnect();
  process.exit(allOk ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
