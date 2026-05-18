// src/lib/reports/queries/fiscal.test.ts

import {
  queryFaturamentoPeriodo,
  queryNotasEmitidas,
  queryNotasRecebidas,
  queryImpostosPeriodo,
  queryFaturamentoPorCliente,
  queryProdutosFaturados,
} from "./fiscal";

// Stub de prisma — substituído por mock real em cada describe
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

    const call = (mockPrisma.fatoNotaFiscal.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.entradaSaida).toBe("1");
    expect(call.where?.situacaoNfe).toBe("autorizada");
  });

  it("aplica filtro de período quando informado", async () => {
    const mockPrisma = {
      fatoNotaFiscal: {
        findMany: jest.fn().mockResolvedValue([{ vrNf: "200.00" }]),
      },
    } as unknown as Parameters<typeof queryFaturamentoPeriodo>[0];

    const result = await queryFaturamentoPeriodo(mockPrisma, {
      periodoDe: "2024-01-01",
      periodoAte: "2024-01-31",
    });
    expect(result.totalNotas).toBe(1);
    expect(result.valorFaturado).toBeCloseTo(200);

    const call = (mockPrisma.fatoNotaFiscal.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.dataEmissao?.gte).toEqual(new Date("2024-01-01T00:00:00"));
    expect(call.where?.dataEmissao?.lte).toEqual(new Date("2024-01-31T00:00:00"));
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
            dataEmissao: new Date("2024-01-15T00:00:00"),
            situacaoNfe: "autorizada",
            participanteNome: "Cliente A",
            vrNf: "1000.00",
          },
        ]),
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
      },
    } as unknown as Parameters<typeof queryNotasEmitidas>[0];

    await queryNotasEmitidas(mockPrisma, { periodoDe: "2024-01-01", periodoAte: "2024-01-31" });
    const call = (mockPrisma.fatoNotaFiscal.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.dataEmissao?.gte).toEqual(new Date("2024-01-01T00:00:00"));
    expect(call.where?.dataEmissao?.lte).toEqual(new Date("2024-01-31T00:00:00"));
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
      },
    } as unknown as Parameters<typeof queryNotasRecebidas>[0];

    await queryNotasRecebidas(mockPrisma, { periodoDe: "2024-01-01", periodoAte: "2024-01-31" });
    const call = (mockPrisma.fatoNotaFiscal.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.dataEmissao?.gte).toEqual(new Date("2024-01-01T00:00:00"));
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

    await queryImpostosPeriodo(mockPrisma, { periodoDe: "2024-01-01", periodoAte: "2024-01-31" });
    const call = (mockPrisma.fatoNotaFiscal.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.dataEmissao?.gte).toEqual(new Date("2024-01-01T00:00:00"));
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

    const call = (mockPrisma.fatoNotaFiscal.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.entradaSaida).toBe("1");
    expect(call.where?.situacaoNfe).toBe("autorizada");
  });

  it("aplica filtro de período quando informado", async () => {
    const mockPrisma = {
      fatoNotaFiscal: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as Parameters<typeof queryFaturamentoPorCliente>[0];

    await queryFaturamentoPorCliente(mockPrisma, { periodoDe: "2024-01-01", periodoAte: "2024-01-31" });
    const call = (mockPrisma.fatoNotaFiscal.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.dataEmissao?.gte).toEqual(new Date("2024-01-01T00:00:00"));
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

    const result = await queryProdutosFaturados(mockPrisma, { limite: 5 });
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

    const result = await queryProdutosFaturados(mockPrisma, { limite: 2 });
    expect(result.linhas).toHaveLength(2);
    expect(result.linhas[0]?.produtoNome).toBe("Produto A");
  });

  it("aplica filtro de período na relação com fatoNotaFiscal", async () => {
    const mockPrisma = {
      fatoNotaFiscalItem: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as Parameters<typeof queryProdutosFaturados>[0];

    await queryProdutosFaturados(mockPrisma, { periodoDe: "2024-01-01", periodoAte: "2024-01-31" });
    const call = (mockPrisma.fatoNotaFiscalItem.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.dataEmissao?.gte).toEqual(new Date("2024-01-01T00:00:00"));
    expect(call.where?.dataEmissao?.lte).toEqual(new Date("2024-01-31T00:00:00"));
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

// Silencia o "unused variable" lint — fakePrisma é placeholder para os mocks futuros
void fakePrisma;
