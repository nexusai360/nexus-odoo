import { faturamentoNaoAutorizado } from "./faturamento-nao-autorizado";
import type { PrismaClient } from "../../../generated/prisma/client";

describe("faturamentoNaoAutorizado", () => {
  it("decompoe por situacao (denegada, rejeitada, null) e soma o total", async () => {
    const findMany = jest.fn().mockResolvedValue([
      { situacaoNfe: "denegada", vrNf: 100 },
      { situacaoNfe: "denegada", vrNf: 50 },
      { situacaoNfe: null, vrNf: 30 },
      { situacaoNfe: "rejeitada", vrNf: 20 },
    ]);
    const prisma = { fatoNotaFiscal: { findMany } } as unknown as PrismaClient;

    const r = await faturamentoNaoAutorizado(prisma, { periodoDe: "2026-01-01", periodoAte: "2026-01-31" });

    expect(r.totalNotas).toBe(4);
    expect(r.valor).toBe(200);
    const deneg = r.porSituacao.find((x) => x.situacaoNfe === "denegada");
    expect(deneg).toEqual({ situacaoNfe: "denegada", totalNotas: 2, valor: 150 });
    const semSituacao = r.porSituacao.find((x) => x.situacaoNfe === null);
    expect(semSituacao).toEqual({ situacaoNfe: null, totalNotas: 1, valor: 30 });

    const where = findMany.mock.calls[0][0].where;
    expect(where.entradaSaida).toBe("1");
    expect(where.OR).toEqual([
      { situacaoNfe: { notIn: ["autorizada", "cancelada"] } },
      { situacaoNfe: null },
    ]);
  });
});
