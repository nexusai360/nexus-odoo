// src/lib/reports/queries/estoque.test.ts
// Testes do núcleo de query de estoque (framework-neutro).
// Cada describe corresponde a uma função-núcleo; os corpos são preenchidos
// nas tasks 4c.1a-extr … 4c.1f-extr.
//
// Jest roda com transform CJS (ts-jest, preset:"ts-jest", sem
// --experimental-vm-modules). jest.spyOn() intercepta corretamente — ver N7.

import { createMockContext } from "@/lib/reports/queries/__mocks__/prisma";
import { querySaldoProduto } from "./estoque";

// Tipo auxiliar para o mock do prisma usado neste arquivo
type MockPrisma = ReturnType<typeof createMockContext>;

describe("querySaldoProduto", () => {
  let mockPrisma: MockPrisma;

  beforeEach(() => {
    mockPrisma = createMockContext();
  });

  it("agrega saldoTotal e valorTotal por produtoId", async () => {
    mockPrisma.fatoEstoqueSaldo.findMany.mockResolvedValue([
      {
        produtoId: 1,
        produtoNome: "Esteira",
        familiaNome: "Cardio",
        marcaNome: "Matrix",
        localId: 10,
        localNome: "Galpão A » Próprio",
        quantidade: 5,
        vrSaldo: 1000,
      },
      {
        produtoId: 1,
        produtoNome: "Esteira",
        familiaNome: "Cardio",
        marcaNome: "Matrix",
        localId: 11,
        localNome: "Virtual",
        quantidade: 2,
        vrSaldo: 400,
      },
    ]);
    const result = await querySaldoProduto(mockPrisma as never, {});
    expect(result.linhas).toHaveLength(1);
    const linha = result.linhas[0]!;
    expect(linha.saldoTotal).toBe(7);
    expect(linha.valorTotal).toBe(1400);
    expect(linha.numLocais).toBe(2);
  });

  it("calcula KPIs corretos", async () => {
    mockPrisma.fatoEstoqueSaldo.findMany.mockResolvedValue([
      {
        produtoId: 1,
        produtoNome: "A",
        familiaNome: null,
        marcaNome: null,
        localId: 1,
        localNome: "Virtual",
        quantidade: -3,
        vrSaldo: 100,
      },
      {
        produtoId: 2,
        produtoNome: "B",
        familiaNome: null,
        marcaNome: null,
        localId: 2,
        localNome: "Virtual",
        quantidade: 5,
        vrSaldo: 200,
      },
    ]);
    const result = await querySaldoProduto(mockPrisma as never, {});
    expect(result.kpis.totalProdutos).toBe(2);
    expect(result.kpis.produtosNegativos).toBe(1);
    expect(result.kpis.valorTotal).toBe(300);
  });

  it("popula detalhePorLocal com rótulo limpo via limparNomeLocal", async () => {
    mockPrisma.fatoEstoqueSaldo.findMany.mockResolvedValue([
      {
        produtoId: 1,
        produtoNome: "Bike",
        familiaNome: null,
        marcaNome: null,
        localId: 10,
        localNome: "Galpão A » Próprio",
        quantidade: 3,
        vrSaldo: 600,
      },
    ]);
    const result = await querySaldoProduto(mockPrisma as never, {});
    const det = result.linhas[0]!.detalhePorLocal;
    expect(det).toHaveLength(1);
    expect(det[0]!.localRotulo).toBe("Galpão A");
  });

  it("aplica filtro armazemId no findMany", async () => {
    mockPrisma.fatoEstoqueSaldo.findMany.mockResolvedValue([]);
    await querySaldoProduto(mockPrisma as never, { armazemId: 5 });
    expect(mockPrisma.fatoEstoqueSaldo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ localId: 5 }) }),
    );
  });

  it("aplica filtro familiaId no findMany", async () => {
    mockPrisma.fatoEstoqueSaldo.findMany.mockResolvedValue([]);
    await querySaldoProduto(mockPrisma as never, { familiaId: 7 });
    expect(mockPrisma.fatoEstoqueSaldo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ familiaId: 7 }) }),
    );
  });

  it("ignora linhas sem produtoId", async () => {
    mockPrisma.fatoEstoqueSaldo.findMany.mockResolvedValue([
      {
        produtoId: null,
        produtoNome: null,
        familiaNome: null,
        marcaNome: null,
        localId: null,
        localNome: null,
        quantidade: 5,
        vrSaldo: 100,
      },
    ]);
    const result = await querySaldoProduto(mockPrisma as never, {});
    expect(result.linhas).toHaveLength(0);
    expect(result.kpis.totalProdutos).toBe(0);
  });
});

describe("queryValorArmazem", () => {
  // preenchido em 4c.1b-extr
});

describe("queryEntradasSaidas", () => {
  // preenchido em 4c.1c-extr
});

describe("queryProdutosParados", () => {
  // preenchido em 4c.1d-extr
});

describe("queryTopMovimentados", () => {
  // preenchido em 4c.1e-extr
});

describe("queryConcentracao", () => {
  // preenchido em 4c.1f-extr
});
