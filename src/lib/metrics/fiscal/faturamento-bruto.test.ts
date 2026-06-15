import { faturamentoBruto } from "./faturamento-bruto";
import type { PrismaClient } from "../../../generated/prisma/client";

describe("faturamentoBruto", () => {
  it("so filtra saida e periodo, sem situacao nem natureza", async () => {
    const aggregate = jest.fn().mockResolvedValue({ _sum: { vrNf: 5000 } });
    const count = jest.fn().mockResolvedValue(20);
    const prisma = { fatoNotaFiscal: { aggregate, count } } as unknown as PrismaClient;

    const r = await faturamentoBruto(prisma, { periodoDe: "2026-01-01", periodoAte: "2026-01-31" });

    expect(r).toEqual({ totalNotas: 20, valor: 5000 });
    const where = aggregate.mock.calls[0][0].where;
    expect(where.entradaSaida).toBe("1");
    expect(where.situacaoNfe).toBeUndefined();
    expect(where.naturezaOperacaoId).toBeUndefined();
  });
});
