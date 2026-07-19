// src/worker/fatos/__e2e__/captura-preco.e2e.ts
// E2E contra o cache real. Roda FORA do jest (nao colide com o suite paralelo no DB dev).
//   E2E=1 npx tsx --env-file=.env.local src/worker/fatos/__e2e__/captura-preco.e2e.ts
import { prisma } from "@/lib/prisma";
import { capturarPreco } from "../captura-preco";
import { rebuildFatoPreco } from "../fato-preco";

if (process.env.E2E !== "1") {
  console.log("pulado (defina E2E=1)");
  process.exit(0);
}

let falhas = 0;
function ok(cond: boolean, msg: string) {
  console.log((cond ? "OK   " : "FALHA ") + msg);
  if (!cond) falhas++;
}

async function limpar() {
  await prisma.fatoPrecoHistorico.deleteMany({});
  await prisma.fatoCapturaRodada.deleteMany({ where: { serie: "preco" } });
}

async function main() {
  await limpar();
  try {
    // (2) base + idempotencia + dedup do par 15049
    const r1 = await capturarPreco(prisma);
    ok(r1.status === "base", `1a captura e base (status=${r1.status}, gravadas=${r1.gravadas})`);
    const vig = await prisma.fatoPrecoHistorico.count({ where: { vigente: true } });
    const dist = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*) n FROM (SELECT DISTINCT tabela_id, produto_id, quantidade_minima FROM fato_preco_historico WHERE vigente) t`,
    );
    ok(vig === Number(dist[0].n), `um vigente por chave (dedup): ${vig} == ${dist[0].n}`);

    const r2 = await capturarPreco(prisma);
    ok(r2.status === "ok" && r2.gravadas === 0, `2a captura sem mudanca grava zero (status=${r2.status}, gravadas=${r2.gravadas})`);

    // (3) alteracao de valor -> captura -> 1 linha mudanca com valor novo
    const alvo = await prisma.fatoPrecoHistorico.findFirst({ where: { vigente: true, valor: { not: null } } });
    if (!alvo) throw new Error("sem base");
    const valorNovo = Number(alvo.valor) + 1;
    await prisma.fatoPreco.updateMany({ where: { tabelaId: alvo.tabelaId, produtoId: alvo.produtoId }, data: { valor: valorNovo } });
    const r3 = await capturarPreco(prisma);
    const novo = await prisma.fatoPrecoHistorico.findFirst({ where: { vigente: true, tabelaId: alvo.tabelaId, produtoId: alvo.produtoId } });
    ok(r3.gravadas >= 1 && novo?.evento === "mudanca" && Number(novo?.valor) === valorNovo, `alteracao gera 1 mudanca com valor novo (evento=${novo?.evento}, valor=${novo?.valor})`);
    // um unico vigente para a chave apos a mudanca
    const vigChave = await prisma.fatoPrecoHistorico.count({ where: { vigente: true, tabelaId: alvo.tabelaId, produtoId: alvo.produtoId } });
    ok(vigChave === 1, `um unico vigente por chave apos a mudanca (${vigChave})`);

    // (4) baixa: remove a chave do fato -> captura -> linha baixa (valor null)
    await prisma.fatoPreco.deleteMany({ where: { tabelaId: alvo.tabelaId, produtoId: alvo.produtoId } });
    await capturarPreco(prisma);
    const baixa = await prisma.fatoPrecoHistorico.findFirst({ where: { vigente: true, tabelaId: alvo.tabelaId, produtoId: alvo.produtoId } });
    ok(baixa?.evento === "baixa" && baixa?.valor === null, `baixa: evento=baixa e valor NULL (evento=${baixa?.evento}, valor=${baixa?.valor})`);

    // (4) ressurreicao: rebuild devolve a chave -> captura -> mudanca
    await rebuildFatoPreco(prisma);
    const r5 = await capturarPreco(prisma);
    const ress = await prisma.fatoPrecoHistorico.findFirst({ where: { vigente: true, tabelaId: alvo.tabelaId, produtoId: alvo.produtoId } });
    ok(r5.gravadas >= 1 && ress?.evento === "mudanca" && ress?.valor !== null, `ressurreicao: baixa -> mudanca (evento=${ress?.evento})`);
  } finally {
    // devolve o fato de preco ao estado real e limpa o historico de teste
    await rebuildFatoPreco(prisma);
    await limpar();
    await prisma.$disconnect();
  }
  console.log(falhas === 0 ? "\nTODOS OK" : `\n${falhas} FALHAS`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
