// src/lib/reports/__tests__/e2e/faturamento-venda-operacao.e2e.ts
// E2E real da regra "so venda" (operacao fiscal) contra o cache.
// Crava o numero conferido com o Odoo pelo dono: julho/2026, grupo = R$ 7.242.504,80 em
// 136 notas. Confere as tres camadas (metrica canonica do agente Nex, relatorios e
// dashboard da diretoria) e a quebra por empresa (a soma das empresas fecha o grupo).
//
// Rodar contra o cache real:
//   E2E=1 npx tsx --env-file=.env.local src/lib/reports/__tests__/e2e/faturamento-venda-operacao.e2e.ts
import { prisma } from "@/lib/prisma";
import { faturamentoAutorizado } from "@/lib/metrics/fiscal/faturamento-autorizado";
import { queryFaturamentoPeriodo } from "@/lib/reports/queries/fiscal";
import { queryIndicadoresVendas, queryVendasPorUf } from "@/lib/diretoria/queries/vendas";
import { listarEmpresasDoFato } from "@/lib/metrics/_shared/empresa";

/** O numero do Odoo, conferido pelo dono (julho/2026, grupo inteiro). */
const JULHO = { periodoDe: "2026-07-01", periodoAte: "2026-07-31" };
const ESPERADO_VALOR = 7_242_504.8;
const ESPERADO_NOTAS = 136;

function check(cond: boolean, msg: string, erros: string[]): void {
  if (cond) console.log(`OK   ${msg}`);
  else {
    console.error(`FALHOU ${msg}`);
    erros.push(msg);
  }
}

const brl = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
/** Tolerancia de 1 centavo (arredondamento de ponto flutuante na soma). */
const bate = (a: number, b: number) => Math.abs(a - b) < 0.011;

async function main() {
  if (process.env.E2E !== "1") {
    console.log("SKIP: defina E2E=1 para rodar contra o cache real.");
    return;
  }
  const erros: string[] = [];

  // 1. Metrica canonica (agente Nex + MCP)
  const metrica = await faturamentoAutorizado(prisma, JULHO);
  console.log(`\n== julho/2026, grupo ==`);
  console.log(`metrica canonica     = ${brl(metrica.valor)} (${metrica.totalNotas} notas)`);
  check(bate(metrica.valor, ESPERADO_VALOR), `faturamento = ${brl(ESPERADO_VALOR)}`, erros);
  check(metrica.totalNotas === ESPERADO_NOTAS, `${ESPERADO_NOTAS} notas de venda`, erros);

  // 2. Relatorios
  const relatorio = await queryFaturamentoPeriodo(prisma, JULHO);
  console.log(`relatorio            = ${brl(relatorio.valorFaturado)} (${relatorio.totalNotas} notas)`);
  check(bate(relatorio.valorFaturado, ESPERADO_VALOR), "relatorio bate a metrica canonica", erros);

  // 3. Dashboard da diretoria
  const dashboard = await queryIndicadoresVendas(prisma, JULHO);
  console.log(`dashboard diretoria  = ${brl(dashboard.faturamento)}`);
  check(bate(dashboard.faturamento, ESPERADO_VALOR), "dashboard bate a metrica canonica", erros);

  // 4. Mapa por estado: a soma das UFs fecha o KPI
  const uf = await queryVendasPorUf(prisma, JULHO);
  console.log(`mapa por estado      = ${brl(uf.valorGeral)} em ${uf.linhas.length} UFs`);
  check(bate(uf.valorGeral, ESPERADO_VALOR), "soma do mapa por estado fecha o KPI", erros);

  // 5. Quebra por empresa (o filtro novo do dashboard)
  const empresas = await listarEmpresasDoFato(prisma);
  let somaEmpresas = 0;
  let somaNotas = 0;
  console.log(`\n== quebra por empresa (filtro do dashboard) ==`);
  for (const e of empresas) {
    const f = await faturamentoAutorizado(prisma, { ...JULHO, empresaId: e.empresaId });
    if (f.valor === 0 && f.totalNotas === 0) continue;
    somaEmpresas += f.valor;
    somaNotas += f.totalNotas;
    console.log(`  ${e.nome.padEnd(28)} ${brl(f.valor).padStart(16)} (${f.totalNotas} notas)`);

    const d = await queryIndicadoresVendas(prisma, { ...JULHO, empresaId: e.empresaId });
    check(
      bate(d.faturamento, f.valor),
      `dashboard da empresa ${e.empresaId} bate a metrica (${brl(f.valor)})`,
      erros,
    );
  }
  console.log(`  ${"TOTAL".padEnd(28)} ${brl(somaEmpresas).padStart(16)} (${somaNotas} notas)`);
  check(bate(somaEmpresas, ESPERADO_VALOR), "soma das empresas fecha o total do grupo", erros);
  check(somaNotas === ESPERADO_NOTAS, "soma das notas por empresa fecha o total", erros);

  console.log("");
  if (erros.length) {
    console.error(`${erros.length} verificacao(oes) falharam.`);
    process.exit(1);
  }
  console.log("Tudo verde: a regra so venda bate o Odoo nas tres camadas.");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
