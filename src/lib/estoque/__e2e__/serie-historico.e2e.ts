// src/lib/estoque/__e2e__/serie-historico.e2e.ts
// E2E contra o cache real das 3 consultas do historico temporal.
//   E2E=1 npx tsx --env-file=.env.local src/lib/estoque/__e2e__/serie-historico.e2e.ts
import { prisma } from "@/lib/prisma";
import { capturarPreco } from "@/worker/fatos/captura-preco";
import { capturarSaldo } from "@/worker/fatos/captura-saldo";
import { serieDePreco, serieDeSaldo, movimentacao } from "../serie-historico";

if (process.env.E2E !== "1") {
  console.log("pulado (defina E2E=1)");
  process.exit(0);
}

let falhas = 0;
function ok(cond: boolean, msg: string) {
  console.log((cond ? "OK   " : "FALHA ") + msg);
  if (!cond) falhas++;
}

async function main() {
  await prisma.fatoPrecoHistorico.deleteMany({});
  await prisma.fatoEstoqueSaldoHistorico.deleteMany({});
  await prisma.fatoCapturaRodada.deleteMany({});
  try {
    await capturarPreco(prisma);
    await capturarSaldo(prisma);

    // carry-forward de preco: janela um ano a frente da base (nenhum ponto dentro),
    // mas o inicial (vigente antes da janela) vem preenchido.
    const alvoP = await prisma.fatoPrecoHistorico.findFirst({ where: { vigente: true, valor: { not: null } } });
    if (!alvoP) throw new Error("sem base de preco");
    const sp = await serieDePreco(prisma, alvoP.produtoId, alvoP.tabelaId, Number(alvoP.quantidadeMinima), "2027-01-01", "2027-12-31");
    ok(sp.inicial === alvoP.valor!.toString(), `preco: carry-forward traz o vigente antes da janela (inicial=${sp.inicial})`);
    ok(sp.pontos.length === 0, `preco: nenhum ponto dentro da janela futura (${sp.pontos.length})`);

    // carry-forward de saldo.
    const alvoS = await prisma.fatoEstoqueSaldoHistorico.findFirst({ where: { vigente: true, vrSaldo: { not: null } } });
    if (!alvoS) throw new Error("sem base de saldo");
    const ss = await serieDeSaldo(prisma, alvoS.produtoId, alvoS.localId, "2027-01-01", "2027-12-31");
    ok(ss.inicial?.vrSaldo === alvoS.vrSaldo!.toString(), `saldo: carry-forward traz o vrSaldo vigente (inicial=${ss.inicial?.vrSaldo})`);

    // movimentacao: um produto com movimento retorna linhas.
    const mov = await prisma.fatoEstoqueMovimento.findFirst({ select: { produtoId: true } });
    if (mov?.produtoId) {
      const m = await movimentacao(prisma, mov.produtoId, undefined, "2026-01-01", "2026-12-31");
      ok(m.movimentos.length > 0, `movimentacao: produto com extrato retorna linhas (${m.movimentos.length})`);
      ok(m.localSemExtrato === false, `movimentacao: localSemExtrato=false quando ha movimento`);
    }
  } finally {
    await prisma.fatoPrecoHistorico.deleteMany({});
    await prisma.fatoEstoqueSaldoHistorico.deleteMany({});
    await prisma.fatoCapturaRodada.deleteMany({});
    await prisma.$disconnect();
  }
  console.log(falhas === 0 ? "\nTODOS OK" : `\n${falhas} FALHAS`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
