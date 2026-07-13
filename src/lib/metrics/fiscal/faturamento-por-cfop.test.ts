import { faturamentoPorCfop } from "./faturamento-por-cfop";
import type { PrismaClient } from "../../../generated/prisma/client";
import { CORTE_DADOS_PADRAO } from "@/lib/corte-dados";

const CORTE_ISO = new Date(`${CORTE_DADOS_PADRAO}T00:00:00Z`).toISOString();

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

// REGRESSAO REAL (PR #166, medida em producao em 2026-07-13): a tool agrega TODA saida
// autorizada, mas a marcacao de intragrupo vinha de um loader cujo universo EXCLUI a
// operacao "venda interna" , que e justamente onde mora a venda entre empresas do grupo,
// com CFOP de receita (5102/6108). Numerador contava, subtraendo nao: a eliminacao foi a
// R$ 0,02 e a tool passou a responder "receita real R$ 102,1 mi" enquanto o KPI da diretoria
// dizia R$ 61,9 mi (+65%). A marcacao TEM que nascer do mesmo universo que a soma.
describe("faturamentoPorCfop , eliminacao intragrupo (mesmo universo da soma)", () => {
  it("nota de venda INTERNA para empresa do grupo e eliminada da receita real", async () => {
    const notasDoUniverso = [
      // Venda externa: cliente de fora (nao esta na whitelist nem no cadastro do grupo).
      { odooId: 10, participanteId: 999, participanteNome: "Cliente Externo", empresaId: 1, empresaNome: "JDS" },
      // Venda INTERNA: destinatario e empresa do grupo (vem do cadastro, fatoParceiro).
      { odooId: 20, participanteId: 500, participanteNome: "JDS Matriz", empresaId: 1, empresaNome: "JDS" },
    ];
    const groupBy = jest.fn().mockImplementation((arg: { where?: { documentoId?: { in: number[] } } }) => {
      // 2a chamada: itens SO das notas intragrupo (a tool passa documentoId in [...]).
      const ids = arg.where?.documentoId?.in;
      if (ids) {
        return Promise.resolve(
          ids.includes(20) ? [{ cfopId: 1, _sum: { vrProdutos: 400 }, _count: 1 }] : [],
        );
      }
      // 1a chamada: universo inteiro (externa 1000 + interna 400, ambas CFOP 5102 receita).
      return Promise.resolve([{ cfopId: 1, _sum: { vrProdutos: 1400 }, _count: 5 }]);
    });
    const prisma = {
      fatoNotaFiscalItem: {
        groupBy,
        findMany: jest.fn().mockResolvedValue([{ cfopId: 1, cfopNome: "5102 - Venda" }]),
      },
      fatoNotaFiscal: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { vrProdutos: 1400 } }),
        findMany: jest.fn().mockResolvedValue(notasDoUniverso),
      },
      // Cadastro do grupo: o participante 500 tem CNPJ com raiz do grupo (RAIZES_GRUPO),
      // que e a 2a camada da marcacao intercompany (whitelist -> cadastro -> raiz no nome).
      fatoParceiro: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ odooId: 500, documentoDigits: "07390039000199" }]),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    } as unknown as PrismaClient;

    const r = await faturamentoPorCfop(prisma, { agruparPor: "categoria" });

    expect(r.totalReceita).toBe(1400); // bruto, com a interna dentro
    expect(r.receitaIntragrupo).toBe(400); // a interna e reconhecida (era 0 , o bug)
    expect(r.totalReceitaReal).toBe(1000); // e sai da receita real
  });

  it("sem nota intragrupo no universo, a receita real e igual a bruta", async () => {
    const { prisma } = mockPrisma(
      [{ cfopId: 1, _sum: { vrProdutos: 1000 }, _count: 4 }],
      [{ cfopId: 1, cfopNome: "5102 - Venda" }],
      1000,
    );
    const r = await faturamentoPorCfop(prisma, { agruparPor: "categoria" });
    expect(r.receitaIntragrupo).toBe(0);
    expect(r.totalReceitaReal).toBe(1000);
  });
});

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

// Os baldes semCfopPorFinalidade e outrasNaoEspecificadas sao SQL cru e precisam nascer do
// MESMO recorte de data dos totais (que ja e clampado). Se divergirem, a resposta se contradiz
// sozinha: o balde soma item anterior a data de inicio das analises e nao fecha com
// totalProdutos / totalNaoReceita.
describe("faturamentoPorCfop , data de inicio das analises (blocos SQL cru)", () => {
  it("sem periodo: o SQL cru emite o recorte com piso no corte, igual ao groupBy", async () => {
    const { prisma, groupBy, queryRawUnsafe } = mockPrisma([], [], 0);
    await faturamentoPorCfop(prisma, {});

    const dataDoGroupBy = groupBy.mock.calls[0][0].where.dataEmissao;
    expect(dataDoGroupBy.gte).toEqual(new Date(CORTE_ISO));

    for (const [sql, ...params] of queryRawUnsafe.mock.calls as [string, ...unknown[]][]) {
      expect(sql).toContain("i.data_emissao >= $1::timestamptz");
      expect(sql).toContain("i.data_emissao < $2::timestamptz");
      expect(params[0]).toBe(dataDoGroupBy.gte.toISOString()); // o MESMO piso dos totais
      expect(params[1]).toBe(dataDoGroupBy.lt.toISOString());
    }
  });

  it("periodoDe anterior ao corte: SQL cru e groupBy grampeiam no mesmo ponto", async () => {
    const { prisma, groupBy, queryRawUnsafe } = mockPrisma([], [], 0);
    await faturamentoPorCfop(prisma, { periodoDe: "2023-01-01", periodoAte: "2026-06-30" });

    const dataDoGroupBy = groupBy.mock.calls[0][0].where.dataEmissao;
    expect(dataDoGroupBy.gte).toEqual(new Date(CORTE_ISO));

    const [, gte, lt] = queryRawUnsafe.mock.calls[0] as [string, string, string];
    expect(gte).toBe(CORTE_ISO);
    expect(lt).toBe(new Date("2026-07-01T00:00:00Z").toISOString()); // borda exclusiva
  });

  it("com empresa, a empresa vira o 3o parametro (depois do par de datas)", async () => {
    const { prisma, queryRawUnsafe } = mockPrisma([], [], 0);
    await faturamentoPorCfop(prisma, { periodoDe: "2026-05-01", periodoAte: "2026-05-31", empresaId: 7 });

    const [sql, gte, lt, empresa] = queryRawUnsafe.mock.calls[0] as [string, string, string, number];
    expect(gte).toBe(new Date("2026-05-01T00:00:00Z").toISOString());
    expect(lt).toBe(new Date("2026-06-01T00:00:00Z").toISOString());
    expect(sql).toContain("i.empresa_id = $3");
    expect(empresa).toBe(7);
  });
});
