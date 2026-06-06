import { faturamentoAutorizadoTotal } from "./faturamento-autorizado-total";
import type { PrismaClient } from "../../../generated/prisma/client";

describe("faturamentoAutorizadoTotal", () => {
  it("nao exclui natureza nao-venda (sem naturezaOperacaoId no where)", async () => {
    const aggregate = jest.fn().mockResolvedValue({ _sum: { vrNf: 2500 } });
    const count = jest.fn().mockResolvedValue(8);
    const prisma = { fatoNotaFiscal: { aggregate, count } } as unknown as PrismaClient;

    const r = await faturamentoAutorizadoTotal(prisma, { periodoDe: "2026-01-01", periodoAte: "2026-01-31" });

    expect(r).toEqual({ totalNotas: 8, valor: 2500 });
    const where = aggregate.mock.calls[0][0].where;
    expect(where.entradaSaida).toBe("1");
    expect(where.situacaoNfe).toBe("autorizada");
    expect(where.naturezaOperacaoId).toBeUndefined();
  });
});
