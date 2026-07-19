// src/worker/fatos/__e2e__/captura-saldo.e2e.ts
// E2E contra o cache real. Roda FORA do jest.
//   E2E=1 npx tsx --env-file=.env.local src/worker/fatos/__e2e__/captura-saldo.e2e.ts
import { prisma } from "@/lib/prisma";
import { capturarSaldo } from "../captura-saldo";
import { RECUSADAS_ATE_REBASE } from "@/lib/estoque/guarda-sanidade";

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
  await prisma.fatoEstoqueSaldoHistorico.deleteMany({});
  await prisma.fatoCapturaRodada.deleteMany({ where: { serie: "saldo" } });
}

async function main() {
  await limpar();
  const backup = await prisma.fatoEstoqueSaldo.findMany(); // backup ANTES de qualquer mutacao
  try {
    const r1 = await capturarSaldo(prisma);
    ok(r1.status === "base", `1a captura de saldo e base (status=${r1.status}, gravadas=${r1.gravadas})`);
    const vig = await prisma.fatoEstoqueSaldoHistorico.count({ where: { vigente: true } });
    const dist = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*) n FROM (SELECT DISTINCT produto_id, local_id FROM fato_estoque_saldo_historico WHERE vigente) t`,
    );
    ok(vig === Number(dist[0].n), `um vigente por (produto,local): ${vig} == ${dist[0].n}`);

    const r2 = await capturarSaldo(prisma);
    ok(r2.status === "ok" && r2.gravadas === 0, `2a sem mudanca grava zero (status=${r2.status}, gravadas=${r2.gravadas})`);

    // muda so vrSaldo (mesma quantidade) -> mudanca
    const alvo = await prisma.fatoEstoqueSaldo.findFirst({ where: { vrSaldo: { gt: 0 } } });
    if (!alvo) throw new Error("sem saldo");
    await prisma.fatoEstoqueSaldo.update({ where: { id: alvo.id }, data: { vrSaldo: Number(alvo.vrSaldo) + 1 } });
    const r3 = await capturarSaldo(prisma);
    ok(r3.gravadas >= 1, `mudanca so de vrSaldo e capturada (gravadas=${r3.gravadas})`);
    await prisma.fatoEstoqueSaldo.update({ where: { id: alvo.id }, data: { vrSaldo: alvo.vrSaldo } });
    await capturarSaldo(prisma); // devolve o vrSaldo ao valor original no historico

    // guarda: esvazia o fato -> sumico acima do teto -> recusada, sem gravar baixa
    await prisma.fatoEstoqueSaldo.deleteMany({});
    const rRec = await capturarSaldo(prisma);
    ok(rRec.status === "recusada" && rRec.gravadas === 0, `sumico acima do teto: recusada, zero gravado (status=${rRec.status})`);
    const baixas = await prisma.fatoEstoqueSaldoHistorico.count({ where: { evento: "baixa" } });
    ok(baixas === 0, `nenhuma baixa falsa gravada (${baixas})`);

    // rota de saida do dead-state: apos K recusas seguidas com contagem estavel, destrava numa base
    for (let i = 1; i < RECUSADAS_ATE_REBASE; i++) await capturarSaldo(prisma); // completa as K recusas
    const rDestrava = await capturarSaldo(prisma);
    ok(rDestrava.status === "base", `apos ${RECUSADAS_ATE_REBASE} recusas, destrava numa nova base (status=${rDestrava.status})`);
  } finally {
    await prisma.fatoEstoqueSaldo.deleteMany({});
    if (backup.length) await prisma.fatoEstoqueSaldo.createMany({ data: backup }); // restaura SEMPRE
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
