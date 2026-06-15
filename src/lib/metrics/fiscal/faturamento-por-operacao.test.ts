import { faturamentoPorOperacao } from "./faturamento-por-operacao";
import type { PrismaClient } from "../../../generated/prisma/client";

describe("faturamentoPorOperacao", () => {
  it("decompoe por natureza com flag ehVenda e separa venda de nao-venda", async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ naturezaOperacaoId: 9, naturezaOperacaoNome: "Devolução" }]) // idsNaoVenda
      .mockResolvedValueOnce([
        { naturezaOperacaoId: 1, naturezaOperacaoNome: "Venda", vrNf: 1000 },
        { naturezaOperacaoId: 9, naturezaOperacaoNome: "Devolução", vrNf: 200 },
        { naturezaOperacaoId: 1, naturezaOperacaoNome: "Venda", vrNf: 500 },
      ]);
    const prisma = { fatoNotaFiscal: { findMany } } as unknown as PrismaClient;

    const r = await faturamentoPorOperacao(prisma, {});

    expect(r.valorGeral).toBe(1700);
    expect(r.valorVenda).toBe(1500);
    expect(r.valorNaoVenda).toBe(200);
    expect(r.linhas.find((x) => x.naturezaOperacaoId === 1)?.ehVenda).toBe(true);
    expect(r.linhas.find((x) => x.naturezaOperacaoId === 9)?.ehVenda).toBe(false);
  });

  it("ranking trava em limit", async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { naturezaOperacaoId: 1, naturezaOperacaoNome: "A", vrNf: 300 },
        { naturezaOperacaoId: 2, naturezaOperacaoNome: "B", vrNf: 200 },
        { naturezaOperacaoId: 3, naturezaOperacaoNome: "C", vrNf: 100 },
      ]);
    const prisma = { fatoNotaFiscal: { findMany } } as unknown as PrismaClient;
    const r = await faturamentoPorOperacao(prisma, { limit: 2 });
    expect(r.linhas).toHaveLength(2);
    expect(r.total).toBe(3);
  });
});
