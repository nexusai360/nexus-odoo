import { faturamentoPorCfop } from "./faturamento-por-cfop";
import type { PrismaClient } from "../../../generated/prisma/client";

function mockPrisma(
  grupos: unknown[],
  nomes: unknown[],
  somaNotaProdutos: number,
  semCfopFinRows: unknown[] = [],
  outrasRows: unknown[] = [],
) {
  const groupBy = jest.fn().mockResolvedValue(grupos);
  const findMany = jest.fn().mockResolvedValue(nomes);
  const aggregate = jest.fn().mockResolvedValue({ _sum: { vrProdutos: somaNotaProdutos } });
  // $queryRawUnsafe(sql, ...params); distingue as 2 queries pelo conteudo do SQL (1o arg).
  const queryRawUnsafe = jest.fn().mockImplementation((sql: string) => {
    if (sql.includes("cfop_id IS NULL")) return Promise.resolve(semCfopFinRows);
    if (sql.includes("5949%")) return Promise.resolve(outrasRows);
    return Promise.resolve([]);
  });
  // carregarItensVendaComGrupo (split real/intragrupo) consulta as notas e os
  // parceiros do grupo. Sem grupo no mock => nenhuma nota intragrupo => valorReal
  // == valorProdutos e receitaIntragrupo == 0 (nao afeta as assercoes de bruto).
  const notasFindMany = jest.fn().mockResolvedValue([]);
  const parceiroFindMany = jest.fn().mockResolvedValue([]);
  const prisma = {
    fatoNotaFiscalItem: { groupBy, findMany },
    fatoNotaFiscal: { aggregate, findMany: notasFindMany },
    fatoParceiro: { findMany: parceiroFindMany },
    $queryRawUnsafe: queryRawUnsafe,
  } as unknown as PrismaClient;
  return { prisma, groupBy, findMany, aggregate, queryRawUnsafe };
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

describe("faturamentoPorCfop , transparencia (Fase 2.6)", () => {
  it("decompoe semCfop por finalidade e expoe outrasNaoEspecificadas (substancia a confirmar)", async () => {
    const { prisma } = mockPrisma(
      [
        { cfopId: 1, _sum: { vrProdutos: 1000 }, _count: 4 }, // 5102 venda
        { cfopId: null, _sum: { vrProdutos: 80 }, _count: 3 }, // sem_cfop
      ],
      [{ cfopId: 1, cfopNome: "5102 - Venda" }],
      1080,
      // semCfopPorFinalidade (query 1: cfop_id IS NULL)
      [
        { finalidade: "1", n: 2, v: 50 }, // venda candidata
        { finalidade: "4", n: 1, v: 30 }, // devolucao
      ],
      // outras 5949/6949 (query 2: 5949%)
      [
        { finalidade: "1", n: 5, v: 200 }, // substancia a confirmar
        { finalidade: "2", n: 1, v: 10 },
      ],
    );

    const r = await faturamentoPorCfop(prisma, { agruparPor: "categoria" });

    expect(r.semCfop).toEqual({ totalItens: 3, valorProdutos: 80 }); // preservado
    expect(r.semCfopPorFinalidade).toEqual([
      { finalidade: "1", totalItens: 2, valorProdutos: 50 },
      { finalidade: "4", totalItens: 1, valorProdutos: 30 },
    ]);
    expect(r.outrasNaoEspecificadas.totalItens).toBe(6);
    expect(r.outrasNaoEspecificadas.valorProdutos).toBe(210);
    expect(r.outrasNaoEspecificadas.valorFinalidadeVenda).toBe(200); // so finalidade=1
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
