// E2E contra o cache real: o valor de estoque nas pontas que o usuario ve, depois do
// destravamento de acesso das 18 empresas (reuniao 2026-07-19).
//
// O que precisa fechar:
//   - EM TRANSFERENCIA (446) conta como fisico;
//   - o intercompany (285, mercadoria da Jht SP no deposito da Jds) conta como fisico;
//   - os JDS DEMO (incluindo o 414) contam como demonstracao, no bloco "nossos";
//   - as pontas leem da MESMA fonte (locais-por-classificacao), sem regra duplicada.
//
//   npx tsx --env-file=.env.local scripts/e2e/e2e-estoque-classificacao.ts
import { prisma } from "@/lib/prisma";
import {
  queryIndicadoresEstoque,
  queryEstoqueDemonstracao,
} from "@/lib/diretoria/queries/estoque";
import { queryValorArmazem } from "@/lib/reports/queries/estoque";
import { localIdsPorClassificacao } from "@/lib/estoque/locais-por-classificacao";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function main() {
  const fisico = await localIdsPorClassificacao(prisma as never, "fisico");
  const ids = fisico.ids ?? [];
  console.log("== fonte unica: locais fisicos ==");
  console.log("  total:", ids.length, "| 446 (transferencia):", ids.includes(446), "| 285 (intercompany):", ids.includes(285));

  console.log("\n== ponta 1: Diretoria , KPI de estoque (a custo) ==");
  const ind = await queryIndicadoresEstoque(prisma as never);
  console.log("  valorTotal (custo / indice):", brl(ind.valorTotal));
  console.log("  valorACusto:", brl(ind.valorACusto), "| indice:", ind.indice);
  console.log("  itens:", ind.itens, "| produtos:", ind.produtos, "| locais:", ind.locais);
  console.log("  produtosSemCusto:", ind.produtosSemCusto, "| linhasNegativas:", ind.linhasNegativas);

  console.log("\n== ponta 2: Diretoria , demonstracao em 2 blocos (a custo) ==");
  const demo = await queryEstoqueDemonstracao(prisma as never);
  console.log("  valorGeral:", brl(demo.valorGeral));
  console.log("  nossos:", brl(demo.nossos.valorGeral), `(${demo.nossos.linhas.length} locais)`);
  for (const l of demo.nossos.linhas.slice(0, 8)) console.log("    -", l.chave, brl(l.valorTotal));
  console.log("  em cliente:", brl(demo.cliente.valorGeral), `(${demo.cliente.linhas.length} locais)`);

  console.log("\n== ponta 3: Relatorios , valor por armazem (escopo fisico) ==");
  const armazem = await queryValorArmazem(prisma as never, { classificacao: "fisico" });
  console.log("  valorTotal:", brl(armazem.kpis.valorTotal), "| armazens:", armazem.kpis.numArmazens);
  for (const r of armazem.linhasBruto) console.log("    -", r.armazem, brl(r.valor), `(${r.numProdutos} produtos)`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
