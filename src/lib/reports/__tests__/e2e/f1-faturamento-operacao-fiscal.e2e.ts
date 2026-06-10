// src/lib/reports/__tests__/e2e/f1-faturamento-operacao-fiscal.e2e.ts
// E2E real da Fase 1 (faturamento por operacao fiscal) contra o cache.
// Rodar: E2E=1 npx tsx --env-file=.env.local src/lib/reports/__tests__/e2e/f1-faturamento-operacao-fiscal.e2e.ts
import { prisma } from "@/lib/prisma";
import { faturamentoPorCfop } from "@/lib/metrics/fiscal/faturamento-por-cfop";

function check(cond: boolean, msg: string, erros: string[]): void {
  if (cond) console.log(`OK ${msg}`);
  else {
    console.error(`FALHOU ${msg}`);
    erros.push(msg);
  }
}

const brl = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

async function main() {
  if (process.env.E2E !== "1") {
    console.log("SKIP: defina E2E=1 para rodar contra o cache real.");
    return;
  }
  const erros: string[] = [];

  const cat = await faturamentoPorCfop(prisma, { agruparPor: "categoria" });
  console.log(`\n== agruparPor=categoria ==`);
  console.log(`totalProdutos = ${brl(cat.totalProdutos)}`);
  console.log(`totalReceita  = ${brl(cat.totalReceita)} (${((cat.totalReceita / cat.totalProdutos) * 100).toFixed(1)}%)`);
  console.log(`totalNaoRec   = ${brl(cat.totalNaoReceita)}`);
  console.log(`semCfop       = ${brl(cat.semCfop.valorProdutos)} (${cat.semCfop.totalItens} itens)`);
  console.log(`reconciliacao = item ${brl(cat.reconciliacao.somaProdutosItens)} vs nota ${brl(cat.reconciliacao.somaProdutosNotas)} -> dif ${brl(cat.reconciliacao.diferenca)}`);
  for (const l of cat.linhas) {
    console.log(`  ${l.chave.padEnd(20)} rec=${l.ehReceita ? "S" : "N"} ${brl(l.valorProdutos).padStart(18)} (${l.totalItens} itens)`);
  }

  check(cat.totalProdutos > 0, "totalProdutos > 0", erros);
  check(cat.totalReceita > 0, "totalReceita > 0", erros);
  check(cat.totalReceita <= cat.totalProdutos, "totalReceita NAO infla acima do total", erros);
  check(
    Math.abs(cat.totalReceita + cat.totalNaoReceita - cat.totalProdutos) < 1,
    "totalReceita + totalNaoReceita == totalProdutos",
    erros,
  );
  check(cat.semCfop.valorProdutos > 20_000_000, "semCfop material (> R$ 20 mi)", erros);
  const transf = cat.linhas.find((l) => l.categoria === "transferencia");
  check(!transf || transf.ehReceita === false, "transferencia NAO e receita", erros);
  const servico = cat.linhas.find((l) => l.categoria === "servico");
  check(!servico || servico.ehReceita === true, "servico E receita (inclui transporte 6932)", erros);
  const outras = cat.linhas.find((l) => l.categoria === "outras");
  check(!outras || outras.ehReceita === false, "outras (5949/6949) NAO e receita", erros);
  const pct = Math.abs(cat.reconciliacao.diferenca) / cat.reconciliacao.somaProdutosNotas;
  check(pct < 0.01, `reconciliacao fecha < 1% (real ${(pct * 100).toFixed(4)}%)`, erros);

  const porCfop = await faturamentoPorCfop(prisma, { agruparPor: "cfop" });
  const l6152 = porCfop.linhas.find((l) => l.chave === "6152");
  check(!l6152 || l6152.categoria === "transferencia", "6152 = transferencia (nao venda)", erros);
  check(!l6152 || l6152.ehReceita === false, "6152 nao e receita", erros);

  await prisma.$disconnect();

  if (erros.length > 0) {
    console.error(`\n${erros.length} verificacao(oes) falharam.`);
    process.exitCode = 1;
  } else {
    console.log(`\nTODAS as verificacoes E2E passaram.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
