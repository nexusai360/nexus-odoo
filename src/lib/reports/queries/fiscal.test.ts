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
  // testes adicionados em C.7
  it.todo("retorna notas de saída com filtro de período e situacaoNfe");
});

describe("queryNotasRecebidas", () => {
  // testes adicionados em C.8
  it.todo("retorna notas de entrada com filtro de período");
});

describe("queryImpostosPeriodo", () => {
  // testes adicionados em C.9
  it.todo("agrega somaIbpt e somaIcmsProprio por período");
});

describe("queryFaturamentoPorCliente", () => {
  // testes adicionados em C.10
  it.todo("agrupa por participanteNome ordenado por valorTotal desc");
});

describe("queryProdutosFaturados", () => {
  // testes adicionados em C.11
  it.todo("agrupa itens de saída por produtoNome com limite");
});

// Silencia o "unused variable" lint — fakePrisma é placeholder para os mocks futuros
void fakePrisma;
