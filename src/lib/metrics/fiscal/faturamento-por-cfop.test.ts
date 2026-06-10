import { faturamentoPorCfop } from "./faturamento-por-cfop";
import type { PrismaClient } from "../../../generated/prisma/client";

function mockPrisma(grupos: unknown[], nomes: unknown[], somaNotaProdutos: number) {
  const groupBy = jest.fn().mockResolvedValue(grupos);
  const findMany = jest.fn().mockResolvedValue(nomes);
  const aggregate = jest.fn().mockResolvedValue({ _sum: { vrProdutos: somaNotaProdutos } });
  const prisma = {
    fatoNotaFiscalItem: { groupBy, findMany },
    fatoNotaFiscal: { aggregate },
  } as unknown as PrismaClient;
  return { prisma, groupBy, findMany, aggregate };
}

describe("faturamentoPorCfop , agruparPor categoria (default)", () => {
  it("agrega CFOPs em categorias, totalReceita exclui nao-receita, semCfop em linha propria", async () => {
    const { prisma } = mockPrisma(
      [
        { cfopId: 1, _sum: { vrProdutos: 1000 }, _count: 4 }, // 5102 venda (receita)
        { cfopId: 2, _sum: { vrProdutos: 700 }, _count: 2 }, // 6152 transferencia (nao-receita)
        { cfopId: 3, _sum: { vrProdutos: 300 }, _count: 1 }, // 5933 servico (receita)
        { cfopId: null, _sum: { vrProdutos: 50 }, _count: 1 }, // sem_cfop
      ],
      [
        { cfopId: 1, cfopNome: "5102 - Venda" },
        { cfopId: 2, cfopNome: "6152 - Transferencia" },
        { cfopId: 3, cfopNome: "5933 - Servico" },
      ],
      2049, // soma vrProdutos do cabecalho (reconciliacao ~ totalProdutos 2050)
    );

    const r = await faturamentoPorCfop(prisma, { agruparPor: "categoria" });

    expect(r.agruparPor).toBe("categoria");
    expect(r.totalProdutos).toBe(2050);
    expect(r.totalReceita).toBe(1300); // venda 1000 + servico 300
    expect(r.totalNaoReceita).toBe(750); // transferencia 700 + semCfop 50
    expect(r.semCfop).toEqual({ totalItens: 1, valorProdutos: 50 });
    const venda = r.linhas.find((l) => l.chave === "venda");
    expect(venda).toMatchObject({ categoria: "venda", ehReceita: true, valorProdutos: 1000 });
    expect(r.reconciliacao.somaProdutosItens).toBe(2050);
    expect(r.reconciliacao.somaProdutosNotas).toBe(2049);
    expect(r.reconciliacao.diferenca).toBeCloseTo(1, 5);
    expect(r.linhas[0].valorProdutos).toBeGreaterThanOrEqual(r.linhas[1].valorProdutos);
  });
});

describe("faturamentoPorCfop , agruparPor cfop", () => {
  it("uma linha por CFOP, chave = codigo, rotulo = nome limpo", async () => {
    const { prisma, groupBy } = mockPrisma(
      [{ cfopId: 1, _sum: { vrProdutos: 1000 }, _count: 4 }],
      [{ cfopId: 1, cfopNome: "5102 - Venda" }],
      1000,
    );
    const r = await faturamentoPorCfop(prisma, {
      agruparPor: "cfop",
      periodoDe: "2026-01-01",
      periodoAte: "2026-01-31",
      empresaId: 7,
    });
    expect(r.linhas[0]).toMatchObject({ chave: "5102", categoria: "venda", ehReceita: true, valorProdutos: 1000 });
    const arg = groupBy.mock.calls[0][0];
    expect(arg._sum.vrProdutos).toBe(true);
    expect(arg.where.entradaSaida).toBe("1");
    expect(arg.where.situacaoNfe).toBe("autorizada");
    expect(arg.where.empresaId).toBe(7);
    expect(arg.where.dataEmissao).toBeDefined();
  });
});
