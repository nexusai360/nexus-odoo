import { faturamentoAutorizado } from "./faturamento-autorizado";
import type { PrismaClient } from "../../../generated/prisma/client";

describe("faturamentoAutorizado", () => {
  it("le a coluna materializada is_venda_externa (a regra so venda) e retorna soma + count", async () => {
    const aggregate = jest.fn().mockResolvedValue({ _sum: { vrNf: 1000 } });
    const count = jest.fn().mockResolvedValue(3);
    const prisma = { fatoNotaFiscal: { aggregate, count } } as unknown as PrismaClient;

    const r = await faturamentoAutorizado(prisma, {
      periodoDe: "2026-01-01",
      periodoAte: "2026-01-31",
      empresaId: 7,
    });

    expect(r).toEqual({ totalNotas: 3, valor: 1000 });
    const where = aggregate.mock.calls[0][0].where;
    // A regra (saida + autorizada + modelo 55/65 + operacao de venda, nao interna, sem
    // devolucao + destinatario fora do grupo) vive na funcao pura notaEhVendaExterna e e
    // materializada pelo worker; a metrica so le a coluna , mesma verdade do dashboard.
    expect(where.isVendaExterna).toBe(true);
    expect(where.empresaId).toBe(7);
    expect(where.dataEmissao).toBeDefined();
    // Nao filtra mais por natureza: era o que contava a VENDA INTERNA como faturamento.
    expect(where.naturezaOperacaoId).toBeUndefined();
  });

  it("valor 0 quando _sum vem null", async () => {
    const prisma = {
      fatoNotaFiscal: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { vrNf: null } }),
        count: jest.fn().mockResolvedValue(0),
      },
    } as unknown as PrismaClient;
    const r = await faturamentoAutorizado(prisma, {});
    expect(r).toEqual({ totalNotas: 0, valor: 0 });
  });
});
