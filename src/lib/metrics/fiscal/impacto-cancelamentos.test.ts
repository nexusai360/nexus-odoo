import { impactoCancelamentos } from "./impacto-cancelamentos";
import type { PrismaClient } from "../../../generated/prisma/client";

describe("impactoCancelamentos", () => {
  it("filtra saida cancelada", async () => {
    const aggregate = jest.fn().mockResolvedValue({ _sum: { vrNf: 800 } });
    const count = jest.fn().mockResolvedValue(2);
    const prisma = { fatoNotaFiscal: { aggregate, count } } as unknown as PrismaClient;

    const r = await impactoCancelamentos(prisma, { periodoDe: "2026-01-01", periodoAte: "2026-01-31", empresaId: 5 });

    expect(r).toEqual({ totalNotas: 2, valor: 800 });
    const where = aggregate.mock.calls[0][0].where;
    expect(where.entradaSaida).toBe("1");
    expect(where.situacaoNfe).toBe("cancelada");
    expect(where.empresaId).toBe(5);
  });
});
