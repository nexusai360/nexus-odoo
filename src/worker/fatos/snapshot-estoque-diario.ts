// src/worker/fatos/snapshot-estoque-diario.ts
// Captura DIÁRIA do saldo de estoque para a série histórica
// (fato_estoque_saldo_snapshot). Tira uma "foto" do fato_estoque_saldo vivo,
// carimbada com a data de referência em BRT (UTC-3), idempotente por dia
// (regravar o mesmo dia sobrescreve). Permite comparar estoque entre datas
// (diário/semanal/mensal/intervalo) com EXATIDÃO daqui pra frente.
import type { PrismaClient } from "@/generated/prisma/client";

/** Data de referência = dia corrente em BRT (UTC-3), à meia-noite UTC do dia BRT.
 *  Assim a foto fica carimbada com o DIA DE NEGÓCIO correto, independente da
 *  hora UTC em que o job roda. */
export function dataRefBRT(agora: Date): Date {
  const brt = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate()));
}

export async function capturarSnapshotEstoqueDiario(
  prisma: PrismaClient,
  agora: Date = new Date(),
): Promise<{ dataRef: string; linhas: number }> {
  const dataRef = dataRefBRT(agora);

  // Idempotente: regrava a foto do dia (a última execução do dia prevalece).
  await prisma.fatoEstoqueSaldoSnapshot.deleteMany({ where: { dataRef } });

  const saldos = await prisma.fatoEstoqueSaldo.findMany({
    select: {
      produtoId: true,
      produtoNome: true,
      localId: true,
      localNome: true,
      quantidade: true,
      vrSaldo: true,
      familiaId: true,
      familiaNome: true,
      marcaId: true,
      marcaNome: true,
    },
  });

  if (saldos.length === 0) {
    return { dataRef: dataRef.toISOString().slice(0, 10), linhas: 0 };
  }

  // id tem @default(uuid()) no schema; createMany deixa o Prisma gerar.
  await prisma.fatoEstoqueSaldoSnapshot.createMany({
    data: saldos.map((s) => ({ ...s, dataRef })),
  });

  return { dataRef: dataRef.toISOString().slice(0, 10), linhas: saldos.length };
}
