// src/lib/reports/queries/fiscal.test.ts

import {
  queryFaturamentoPeriodo,
  queryNotasEmitidas,
  queryNotasRecebidas,
  queryImpostosPeriodo,
  queryFaturamentoPorCliente,
  queryProdutosFaturados,
  queryNotasRecebidasPorFornecedor,
  queryContarNotas,
} from "./fiscal";

// Stub de prisma , substituído por mock real em cada describe
const fakePrisma = {} as Parameters<typeof queryFaturamentoPeriodo>[0];

describe("queryFaturamentoPeriodo", () => {
  it("retorna totalNotas e valorFaturado de saídas autorizadas sem filtro", async () => {
    const mockPrisma = {
      fatoNotaFiscal: {
        findMany: jest.fn().mockResolvedValue([
          { vrNf: "1000.00" },
          { vrNf: "500.00" },
        ]),
      },
    } as unknown as Parameters<typeof queryFaturamentoPeriodo>[0];

    const result = await queryFaturamentoPeriodo(mockPrisma, {});
    expect(result.totalNotas).toBe(2);
    expect(result.valorFaturado).toBeCloseTo(1500);

    // A regra "so venda" vive materializada em is_venda_externa (saida + autorizada +
    // operacao de venda, nao interna + fora do grupo): a query so le a coluna.
    const calls = (mockPrisma.fatoNotaFiscal.findMany as jest.Mock).mock.calls;
    const call = calls[calls.length - 1][0];
    expect(call.where?.isVendaExterna).toBe(true);
    expect(call.where?.naturezaOperacaoId).toBeUndefined();
  });

  it("aplica filtro de período quando informado", async () => {
    const mockPrisma = {
      fatoNotaFiscal: {
        findMany: jest.fn().mockResolvedValue([{ vrNf: "200.00" }]),
      },
    } as unknown as Parameters<typeof queryFaturamentoPeriodo>[0];

    const result = await queryFaturamentoPeriodo(mockPrisma, {
      periodoDe: "2026-04-01",
      periodoAte: "2026-04-30",
    });
    expect(result.totalNotas).toBe(1);
    expect(result.valorFaturado).toBeCloseTo(200);

    // F1: idsNaoVenda roda primeiro; a query de faturamento e a ULTIMA chamada.
    // Borda de periodo canonica: gte inclusivo, lt exclusivo (ate + 1 dia UTC).
    const calls = (mockPrisma.fatoNotaFiscal.findMany as jest.Mock).mock.calls;
    const call = calls[calls.length - 1][0];
    expect(call.where?.dataEmissao?.gte).toEqual(new Date("2026-04-01T00:00:00Z"));
    expect(call.where?.dataEmissao?.lt).toEqual(new Date("2026-05-01T00:00:00Z"));
  });

  it("retorna zeros quando sem notas", async () => {
    const mockPrisma = {
      fatoNotaFiscal: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as Parameters<typeof queryFaturamentoPeriodo>[0];

    const result = await queryFaturamentoPeriodo(mockPrisma, {});
    expect(result.totalNotas).toBe(0);
    expect(result.valorFaturado).toBe(0);
  });
});

describe("queryNotasEmitidas", () => {
  it("retorna notas de saída (entradaSaida='1') sem filtro", async () => {
    const mockPrisma = {
      fatoNotaFiscal: {
        findMany: jest.fn().mockResolvedValue([
          {
            numero: "001",
            serie: "1",
            dataEmissao: new Date("2026-04-15T00:00:00"),
            situacaoNfe: "autorizada",
            participanteNome: "Cliente A",
            vrNf: "1000.00",
          },
        ]),
        // Alavanca 2b: totalNotas vem do count e valorTotal do aggregate.
        count: jest.fn().mockResolvedValue(1),
        aggregate: jest.fn().mockResolvedValue({ _sum: { vrNf: "1000.00" } }),
      },
    } as unknown as Parameters<typeof queryNotasEmitidas>[0];

    const result = await queryNotasEmitidas(mockPrisma, {});
    expect(result.totalNotas).toBe(1);
    expect(result.valorTotal).toBeCloseTo(1000);
    expect(result.linhas).toHaveLength(1);
    expect(result.linhas[0]?.numero).toBe("001");
    expect(result.linhas[0]?.participanteNome).toBe("Cliente A");

    const call = (mockPrisma.fatoNotaFiscal.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.entradaSaida).toBe("1");
  });

  it("aplica filtro de situacaoNfe quando informado", async () => {
    const mockPrisma = {
      fatoNotaFiscal: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { vrNf: null } }),
      },
    } as unknown as Parameters<typeof queryNotasEmitidas>[0];

    await queryNotasEmitidas(mockPrisma, { situacaoNfe: "cancelada" });
    const call = (mockPrisma.fatoNotaFiscal.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.situacaoNfe).toBe("cancelada");
  });

  it("aplica filtro de período quando informado", async () => {
    const mockPrisma = {
      fatoNotaFiscal: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { vrNf: null } }),
      },
    } as unknown as Parameters<typeof queryNotasEmitidas>[0];

    await queryNotasEmitidas(mockPrisma, { periodoDe: "2026-04-01", periodoAte: "2026-04-30" });
    const call = (mockPrisma.fatoNotaFiscal.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.dataEmissao?.gte).toEqual(new Date("2026-04-01T00:00:00Z"));
    // Borda canonica exclusiva: lt = ate + 1 dia UTC.
    expect(call.where?.dataEmissao?.lt).toEqual(new Date("2026-05-01T00:00:00Z"));
  });
});

describe("queryNotasRecebidas", () => {
  it("retorna notas de entrada (entradaSaida='0') sem filtro", async () => {
    const mockPrisma = {
      fatoNotaFiscal: {
        findMany: jest.fn().mockResolvedValue([
          {
            numero: "002",
            dataEmissao: new Date("2024-02-10T00:00:00"),
            participanteNome: "Fornecedor X",
            vrNf: "3000.00",
          },
        ]),
        // Alavanca 2b: totalNotas vem do count e valorTotal do aggregate.
        count: jest.fn().mockResolvedValue(1),
        aggregate: jest.fn().mockResolvedValue({ _sum: { vrNf: "3000.00" } }),
      },
    } as unknown as Parameters<typeof queryNotasRecebidas>[0];

    const result = await queryNotasRecebidas(mockPrisma, {});
    expect(result.totalNotas).toBe(1);
    expect(result.valorTotal).toBeCloseTo(3000);
    expect(result.linhas[0]?.numero).toBe("002");

    const call = (mockPrisma.fatoNotaFiscal.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.entradaSaida).toBe("0");
  });

  it("aplica filtro de período quando informado", async () => {
    const mockPrisma = {
      fatoNotaFiscal: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { vrNf: null } }),
      },
    } as unknown as Parameters<typeof queryNotasRecebidas>[0];

    await queryNotasRecebidas(mockPrisma, { periodoDe: "2026-04-01", periodoAte: "2026-04-30" });
    const call = (mockPrisma.fatoNotaFiscal.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.dataEmissao?.gte).toEqual(new Date("2026-04-01T00:00:00Z"));
  });
});

describe("queryImpostosPeriodo", () => {
  it("agrega totalNotas, somaIbpt e somaIcmsProprio sem filtro", async () => {
    const mockPrisma = {
      fatoNotaFiscal: {
        findMany: jest.fn().mockResolvedValue([
          { vrIbpt: "200.00", vrIcmsProprio: "120.00" },
          { vrIbpt: "100.00", vrIcmsProprio: "60.00" },
        ]),
      },
    } as unknown as Parameters<typeof queryImpostosPeriodo>[0];

    const result = await queryImpostosPeriodo(mockPrisma, {});
    expect(result.totalNotas).toBe(2);
    expect(result.somaIbpt).toBeCloseTo(300);
    expect(result.somaIcmsProprio).toBeCloseTo(180);
  });

  it("aplica filtro de período quando informado", async () => {
    const mockPrisma = {
      fatoNotaFiscal: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as Parameters<typeof queryImpostosPeriodo>[0];

    await queryImpostosPeriodo(mockPrisma, { periodoDe: "2026-04-01", periodoAte: "2026-04-30" });
    const call = (mockPrisma.fatoNotaFiscal.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.dataEmissao?.gte).toEqual(new Date("2026-04-01T00:00:00Z"));
  });
});

describe("queryFaturamentoPorCliente", () => {
  it("agrupa saídas autorizadas por participanteNome ordenado por valorTotal desc", async () => {
    const mockPrisma = {
      fatoNotaFiscal: {
        findMany: jest.fn().mockResolvedValue([
          { participanteNome: "Cliente A", vrNf: "1000.00" },
          { participanteNome: "Cliente B", vrNf: "3000.00" },
          { participanteNome: "Cliente A", vrNf: "500.00" },
        ]),
      },
    } as unknown as Parameters<typeof queryFaturamentoPorCliente>[0];

    const result = await queryFaturamentoPorCliente(mockPrisma, {});
    expect(result.linhas).toHaveLength(2);
    // ordenado por valorTotal desc: B primeiro
    expect(result.linhas[0]?.participanteNome).toBe("Cliente B");
    expect(result.linhas[0]?.quantidade).toBe(1);
    expect(result.linhas[0]?.valorTotal).toBeCloseTo(3000);
    expect(result.linhas[1]?.participanteNome).toBe("Cliente A");
    expect(result.linhas[1]?.quantidade).toBe(2);
    expect(result.linhas[1]?.valorTotal).toBeCloseTo(1500);

    // Mesma base do faturamento do periodo: a coluna materializada is_venda_externa.
    const calls = (mockPrisma.fatoNotaFiscal.findMany as jest.Mock).mock.calls;
    const call = calls[calls.length - 1][0];
    expect(call.where?.isVendaExterna).toBe(true);
    expect(call.where?.naturezaOperacaoId).toBeUndefined();
  });

  it("aplica filtro de período quando informado", async () => {
    const mockPrisma = {
      fatoNotaFiscal: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as Parameters<typeof queryFaturamentoPorCliente>[0];

    await queryFaturamentoPorCliente(mockPrisma, { periodoDe: "2026-04-01", periodoAte: "2026-04-30" });
    const calls = (mockPrisma.fatoNotaFiscal.findMany as jest.Mock).mock.calls;
    const call = calls[calls.length - 1][0];
    expect(call.where?.dataEmissao?.gte).toEqual(new Date("2026-04-01T00:00:00Z"));
  });
});

describe("queryProdutosFaturados", () => {
  it("agrupa itens de saída por produtoNome com limite", async () => {
    const mockPrisma = {
      fatoNotaFiscalItem: {
        findMany: jest.fn().mockResolvedValue([
          { produtoNome: "Esteira Profissional", quantidade: "2", vrProdutos: "4000.00" },
          { produtoNome: "Bike Ergométrica",     quantidade: "1", vrProdutos: "1500.00" },
          { produtoNome: "Esteira Profissional", quantidade: "3", vrProdutos: "6000.00" },
        ]),
      },
    } as unknown as Parameters<typeof queryProdutosFaturados>[0];

    const result = await queryProdutosFaturados(mockPrisma, { limit: 5 });
    expect(result.linhas).toHaveLength(2);
    // ordenado por valorTotal desc: Esteira (10000) antes de Bike (1500)
    expect(result.linhas[0]?.produtoNome).toBe("Esteira Profissional");
    expect(result.linhas[0]?.quantidadeTotal).toBeCloseTo(5);
    expect(result.linhas[0]?.valorTotal).toBeCloseTo(10000);
    expect(result.linhas[1]?.produtoNome).toBe("Bike Ergométrica");
    expect(result.linhas[1]?.quantidadeTotal).toBeCloseTo(1);
    expect(result.linhas[1]?.valorTotal).toBeCloseTo(1500);

    const call = (mockPrisma.fatoNotaFiscalItem.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.entradaSaida).toBe("1");
  });

  it("respeita o limite informado", async () => {
    const mockPrisma = {
      fatoNotaFiscalItem: {
        findMany: jest.fn().mockResolvedValue([
          { produtoNome: "Produto A", quantidade: "1", vrProdutos: "1000.00" },
          { produtoNome: "Produto B", quantidade: "1", vrProdutos: "900.00" },
          { produtoNome: "Produto C", quantidade: "1", vrProdutos: "800.00" },
        ]),
      },
    } as unknown as Parameters<typeof queryProdutosFaturados>[0];

    const result = await queryProdutosFaturados(mockPrisma, { limit: 2 });
    expect(result.linhas).toHaveLength(2);
    expect(result.linhas[0]?.produtoNome).toBe("Produto A");
    // Alavanca 2b: total = produtos distintos (independente da pagina).
    expect(result.total).toBe(3);
  });

  it("aplica filtro de período na relação com fatoNotaFiscal", async () => {
    const mockPrisma = {
      fatoNotaFiscalItem: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as Parameters<typeof queryProdutosFaturados>[0];

    await queryProdutosFaturados(mockPrisma, { periodoDe: "2026-04-01", periodoAte: "2026-04-30" });
    const call = (mockPrisma.fatoNotaFiscalItem.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.dataEmissao?.gte).toEqual(new Date("2026-04-01T00:00:00Z"));
    // Borda canonica exclusiva: lt = ate + 1 dia UTC.
    expect(call.where?.dataEmissao?.lt).toEqual(new Date("2026-05-01T00:00:00Z"));
  });

  it("retorna lista vazia quando sem itens", async () => {
    const mockPrisma = {
      fatoNotaFiscalItem: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as Parameters<typeof queryProdutosFaturados>[0];

    const result = await queryProdutosFaturados(mockPrisma, {});
    expect(result.linhas).toHaveLength(0);
  });
});

describe("queryNotasRecebidasPorFornecedor", () => {
  it("agrega todas as linhas que casaram em totalAgregado, mesmo além do limite", async () => {
    const mockPrisma = {
      fatoNotaFiscal: {
        findMany: jest.fn().mockResolvedValue([
          { participanteNome: "Fornecedor X - Matriz", vrNf: "1000.00" },
          { participanteNome: "Fornecedor X - Matriz", vrNf: "500.00" },
          { participanteNome: "Fornecedor X - Filial", vrNf: "300.00" },
        ]),
      },
    } as unknown as Parameters<typeof queryNotasRecebidasPorFornecedor>[0];

    const result = await queryNotasRecebidasPorFornecedor(mockPrisma, {
      fornecedor: "Fornecedor X",
      limit: 1,
    });

    // limit=1 corta as linhas exibidas, mas o agregado soma tudo que casou.
    expect(result.linhas).toHaveLength(1);
    expect(result.totalAgregado.quantidade).toBe(3);
    expect(result.totalAgregado.valorTotal).toBeCloseTo(1800);
    expect(result.totalFornecedoresDistintos).toBe(2);
  });

  it("filtra só notas de entrada (entradaSaida='0')", async () => {
    const mockPrisma = {
      fatoNotaFiscal: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as Parameters<typeof queryNotasRecebidasPorFornecedor>[0];

    await queryNotasRecebidasPorFornecedor(mockPrisma, {});
    const call = (mockPrisma.fatoNotaFiscal.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.entradaSaida).toBe("0");
  });

  it("resolve documento (CNPJ) via fato_parceiro comparando só os dígitos", async () => {
    const mockPrisma = {
      fatoParceiro: {
        findMany: jest.fn().mockResolvedValue([
          { odooId: 11, documento: "12.345.678/0001-90" },
          { odooId: 22, documento: "99.999.999/0001-99" },
        ]),
      },
      fatoNotaFiscal: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as Parameters<typeof queryNotasRecebidasPorFornecedor>[0];

    await queryNotasRecebidasPorFornecedor(mockPrisma, { documento: "12345678000190" });
    const call = (mockPrisma.fatoNotaFiscal.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.participanteId).toEqual({ in: [11] });
  });

  it("documento sem nenhum parceiro casado força zero resultados (in:[-1])", async () => {
    const mockPrisma = {
      fatoParceiro: { findMany: jest.fn().mockResolvedValue([]) },
      fatoNotaFiscal: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as Parameters<typeof queryNotasRecebidasPorFornecedor>[0];

    await queryNotasRecebidasPorFornecedor(mockPrisma, { documento: "00000000000000" });
    const call = (mockPrisma.fatoNotaFiscal.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.participanteId).toEqual({ in: [-1] });
  });
});

describe("queryContarNotas", () => {
  it("retorna total, totalEntrada e totalSaida via count", async () => {
    const mockPrisma = {
      fatoNotaFiscal: {
        count: jest
          .fn()
          .mockResolvedValueOnce(500) // total
          .mockResolvedValueOnce(287) // totalEntrada (entradaSaida='0')
          .mockResolvedValueOnce(213), // totalSaida (entradaSaida='1')
      },
    } as unknown as Parameters<typeof queryContarNotas>[0];

    const result = await queryContarNotas(mockPrisma);
    expect(result.total).toBe(500);
    expect(result.totalEntrada).toBe(287);
    expect(result.totalSaida).toBe(213);
  });
});

// Silencia o "unused variable" lint , fakePrisma é placeholder para os mocks futuros
void fakePrisma;
