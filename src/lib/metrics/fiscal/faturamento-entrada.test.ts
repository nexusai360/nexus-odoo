import { faturamentoEntrada } from "./faturamento-entrada";
import type { PrismaClient } from "../../../generated/prisma/client";

describe("faturamentoEntrada", () => {
  it("filtra entrada (entradaSaida='0') autorizada", async () => {
    const aggregate = jest.fn().mockResolvedValue({ _sum: { vrNf: 1500 } });
    const count = jest.fn().mockResolvedValue(4);
    const prisma = { fatoNotaFiscal: { aggregate, count } } as unknown as PrismaClient;

    const r = await faturamentoEntrada(prisma, { periodoDe: "2026-01-01", periodoAte: "2026-01-31" });

    expect(r).toEqual({ totalNotas: 4, valor: 1500 });
    const where = aggregate.mock.calls[0][0].where;
    expect(where.entradaSaida).toBe("0");
    expect(where.situacaoNfe).toBe("autorizada");
  });
});
