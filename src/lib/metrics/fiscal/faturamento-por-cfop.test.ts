import { faturamentoPorCfop } from "./faturamento-por-cfop";
import type { PrismaClient } from "../../../generated/prisma/client";

describe("faturamentoPorCfop", () => {
  it("agrupa por cfop no item, resolve nome, ordena por valor desc", async () => {
    const groupBy = jest.fn().mockResolvedValue([
      { cfopId: 1, _sum: { vrNf: 500 }, _count: 3 },
      { cfopId: 2, _sum: { vrNf: 1500 }, _count: 5 },
      { cfopId: null, _sum: { vrNf: 20 }, _count: 1 },
    ]);
    const findMany = jest.fn().mockResolvedValue([
      { cfopId: 1, cfopNome: "5102" },
      { cfopId: 2, cfopNome: "6108" },
    ]);
    const prisma = { fatoNotaFiscalItem: { groupBy, findMany } } as unknown as PrismaClient;

    const r = await faturamentoPorCfop(prisma, { periodoDe: "2026-01-01", periodoAte: "2026-01-31", empresaId: 7 });

    expect(r.valorGeral).toBe(2020);
    expect(r.linhas[0]).toEqual({ cfopId: 2, cfopNome: "6108", totalLinhas: 5, valor: 1500 });
    const where = groupBy.mock.calls[0][0].where;
    expect(where.entradaSaida).toBe("1");
    expect(where.situacaoNfe).toBe("autorizada");
    expect(where.empresaId).toBe(7);
    expect(where.dataEmissao).toBeDefined();
  });
});
