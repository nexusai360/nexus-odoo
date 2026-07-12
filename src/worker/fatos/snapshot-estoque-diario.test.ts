import { dataRefBRT, capturarSnapshotEstoqueDiario } from "./snapshot-estoque-diario";
import type { PrismaClient } from "@/generated/prisma/client";

describe("dataRefBRT", () => {
  it("23:50 BRT (02:50 UTC do dia seguinte) ainda e o dia de negocio BRT", () => {
    // 2026-06-20T02:50:00Z = 2026-06-19 23:50 BRT -> dia de negocio = 19/06.
    const d = dataRefBRT(new Date("2026-06-20T02:50:00Z"));
    expect(d.toISOString().slice(0, 10)).toBe("2026-06-19");
  });
  it("12:00 UTC = 09:00 BRT -> mesma data", () => {
    const d = dataRefBRT(new Date("2026-06-19T12:00:00Z"));
    expect(d.toISOString().slice(0, 10)).toBe("2026-06-19");
  });
});

describe("capturarSnapshotEstoqueDiario", () => {
  function mockPrisma(saldos: unknown[]) {
    const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const findMany = jest.fn().mockResolvedValue(saldos);
    const createMany = jest.fn().mockResolvedValue({ count: saldos.length });
    // O apagar e o inserir tem que acontecer DENTRO da transacao: fora dela, a foto do dia
    // some por alguns segundos e a comparacao de estoque na tela zera.
    const tx = {
      fatoEstoqueSaldoSnapshot: { deleteMany, createMany },
      fatoEstoqueSaldo: { findMany },
    };
    const $transaction = jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
    const prisma = {
      ...tx,
      $transaction,
    } as unknown as PrismaClient;
    return { prisma, deleteMany, findMany, createMany, $transaction };
  }

  it("apaga e regrava a foto do dia na MESMA transacao (a tela nunca ve o dia vazio)", async () => {
    const { prisma, $transaction, deleteMany, createMany } = mockPrisma([
      { produtoId: 1, produtoNome: "A", localId: 10, localNome: "L1", quantidade: 5, vrSaldo: 100, familiaId: null, familiaNome: null, marcaId: null, marcaNome: null },
    ]);
    await capturarSnapshotEstoqueDiario(prisma, new Date("2026-06-19T12:00:00Z"));
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledTimes(1);
  });

  it("regrava o dia (deleteMany) e insere uma linha por saldo com a mesma dataRef", async () => {
    const { prisma, deleteMany, createMany } = mockPrisma([
      { produtoId: 1, produtoNome: "A", localId: 10, localNome: "L1", quantidade: 5, vrSaldo: 100, familiaId: null, familiaNome: null, marcaId: null, marcaNome: null },
      { produtoId: 2, produtoNome: "B", localId: 10, localNome: "L1", quantidade: 3, vrSaldo: 50, familiaId: null, familiaNome: null, marcaId: null, marcaNome: null },
    ]);
    const r = await capturarSnapshotEstoqueDiario(prisma, new Date("2026-06-19T12:00:00Z"));
    expect(r).toEqual({ dataRef: "2026-06-19", linhas: 2 });
    expect(deleteMany).toHaveBeenCalledTimes(1);
    const dataRefArg = deleteMany.mock.calls[0][0].where.dataRef as Date;
    expect(dataRefArg.toISOString().slice(0, 10)).toBe("2026-06-19");
    const inserted = createMany.mock.calls[0][0].data as Array<{ dataRef: Date; produtoId: number }>;
    expect(inserted).toHaveLength(2);
    expect(inserted.every((x) => x.dataRef.toISOString().slice(0, 10) === "2026-06-19")).toBe(true);
  });

  it("saldo vazio: nao chama createMany, retorna 0 linhas", async () => {
    const { prisma, createMany } = mockPrisma([]);
    const r = await capturarSnapshotEstoqueDiario(prisma, new Date("2026-06-19T12:00:00Z"));
    expect(r.linhas).toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });
});
