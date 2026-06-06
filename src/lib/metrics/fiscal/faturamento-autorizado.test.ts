import { faturamentoAutorizado } from "./faturamento-autorizado";
import type { PrismaClient } from "../../../generated/prisma/client";

describe("faturamentoAutorizado", () => {
  it("monta where de venda autorizada (exclui nao-venda) e retorna soma + count", async () => {
    const aggregate = jest.fn().mockResolvedValue({ _sum: { vrNf: 1000 } });
    const count = jest.fn().mockResolvedValue(3);
    const findMany = jest.fn().mockResolvedValue([
      { naturezaOperacaoId: 9, naturezaOperacaoNome: "Devolução de venda" },
    ]);
    const prisma = { fatoNotaFiscal: { aggregate, count, findMany } } as unknown as PrismaClient;

    const r = await faturamentoAutorizado(prisma, {
      periodoDe: "2026-01-01",
      periodoAte: "2026-01-31",
      empresaId: 7,
    });

    expect(r).toEqual({ totalNotas: 3, valor: 1000 });
    const where = aggregate.mock.calls[0][0].where;
    expect(where.entradaSaida).toBe("1");
    expect(where.situacaoNfe).toBe("autorizada");
    expect(where.empresaId).toBe(7);
    expect(where.naturezaOperacaoId).toEqual({ notIn: [9] });
    expect(where.dataEmissao).toBeDefined();
  });

  it("valor 0 quando _sum vem null", async () => {
    const prisma = {
      fatoNotaFiscal: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { vrNf: null } }),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaClient;
    const r = await faturamentoAutorizado(prisma, {});
    expect(r).toEqual({ totalNotas: 0, valor: 0 });
  });
});
