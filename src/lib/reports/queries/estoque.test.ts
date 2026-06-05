// src/lib/reports/queries/estoque.test.ts
// Testes do núcleo de query de estoque (framework-neutro).
// Cada describe corresponde a uma função-núcleo; os corpos são preenchidos
// nas tasks 4c.1a-extr … 4c.1f-extr.
//
// Jest roda com transform CJS (ts-jest, preset:"ts-jest", sem
// --experimental-vm-modules). jest.spyOn() intercepta corretamente , ver N7.

import { createMockContext } from "@/lib/reports/queries/__mocks__/prisma";
import {
  querySaldoProduto,
  queryValorArmazem,
  queryEntradasSaidas,
  queryProdutosParados,
  queryTopMovimentados,
  queryConcentracao,
} from "./estoque";

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
  let mockPrisma: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    mockPrisma = createMockContext();
  });

  it("agrega valor e numProdutos por armazém via limparNomeLocal", async () => {
    mockPrisma.fatoEstoqueSaldo.findMany.mockResolvedValue([
      { localNome: "Galpão A » Próprio", produtoId: 1, vrSaldo: 1000 },
      { localNome: "Virtual", produtoId: 2, vrSaldo: 400 },
    ]);
    const result = await queryValorArmazem(mockPrisma as never);
    expect(result.kpis.valorTotal).toBe(1400);
    expect(result.kpis.numArmazens).toBe(2);
    expect(result.linhasBruto).toHaveLength(2);
    expect(result.linhasBruto[0]).toMatchObject({ armazem: "Galpão A", valor: 1000 });
  });

  it("NÃO inclui percentual no núcleo (shaping fica no wrapper)", async () => {
    mockPrisma.fatoEstoqueSaldo.findMany.mockResolvedValue([
      { localNome: "Virtual", produtoId: 1, vrSaldo: 500 },
    ]);
    const result = await queryValorArmazem(mockPrisma as never);
    const linha = result.linhasBruto[0]!;
    expect(linha).not.toHaveProperty("percentual");
  });

  it("ordena linhasBruto por valor desc", async () => {
    mockPrisma.fatoEstoqueSaldo.findMany.mockResolvedValue([
      { localNome: "Virtual", produtoId: 1, vrSaldo: 300 },
      { localNome: "Galpão A » Próprio", produtoId: 2, vrSaldo: 700 },
    ]);
    const result = await queryValorArmazem(mockPrisma as never);
    expect(result.linhasBruto[0]!.valor).toBeGreaterThan(result.linhasBruto[1]!.valor);
  });
});

describe("queryEntradasSaidas", () => {
  let mockPrisma: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    mockPrisma = createMockContext();
  });

  it("monta série por mês×sentido corretamente", async () => {
    mockPrisma.fatoEstoqueMovimento.groupBy
      .mockResolvedValueOnce([
        { mes: "2026-03", sentido: "entrada", _sum: { quantidade: 10 } },
        { mes: "2026-03", sentido: "saida", _sum: { quantidade: 4 } },
      ])
      .mockResolvedValueOnce([
        { mes: "2026-03", sentido: "entrada", produtoNome: "Esteira", _sum: { quantidade: 10 } },
      ]);
    const result = await queryEntradasSaidas(mockPrisma as never, {});
    expect(result.serie).toEqual([{ mes: "2026-03", entrada: 10, saida: 4 }]);
  });

  it("monta detalhe por mês×sentido×produto; produtoNome null → 'Sem produto'", async () => {
    mockPrisma.fatoEstoqueMovimento.groupBy
      .mockResolvedValueOnce([{ mes: "2026-03", sentido: "entrada", _sum: { quantidade: 5 } }])
      .mockResolvedValueOnce([
        { mes: "2026-03", sentido: "entrada", produtoNome: null, _sum: { quantidade: 5 } },
      ]);
    const result = await queryEntradasSaidas(mockPrisma as never, {});
    expect(result.detalhe[0]?.produto).toBe("Sem produto");
  });

  it("aplica filtro de período no where", async () => {
    mockPrisma.fatoEstoqueMovimento.groupBy.mockResolvedValue([]);
    await queryEntradasSaidas(mockPrisma as never, { periodoDe: "2026-01", periodoAte: "2026-03" });
    expect(mockPrisma.fatoEstoqueMovimento.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ mes: { gte: "2026-01", lte: "2026-03" } }) }),
    );
  });
});

describe("queryProdutosParados", () => {
  let mockPrisma: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    mockPrisma = createMockContext();
  });

  it("retorna linhas com conversão de Decimal para number", async () => {
    mockPrisma.fatoProdutoParado.findMany.mockResolvedValue([
      { produtoNome: "X", localNome: "A", saldo: "3", dias: 95, vrSaldo: "200" },
    ]);
    const result = await queryProdutosParados(mockPrisma as never, {});
    expect(result.linhas).toHaveLength(1);
    expect(result.linhas[0]!.saldo).toBe(3);
    expect(result.linhas[0]!.vrSaldo).toBe(200);
    expect(result.kpis.valorImobilizado).toBe(200);
  });

  it("aplica filtro faixaDias no where", async () => {
    mockPrisma.fatoProdutoParado.findMany.mockResolvedValue([]);
    await queryProdutosParados(mockPrisma as never, { faixaDias: 90 });
    expect(mockPrisma.fatoProdutoParado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ dias: { gte: 90 } }) }),
    );
  });

  it("ordena por dias desc com desempate estavel por saldoHojeId", async () => {
    mockPrisma.fatoProdutoParado.findMany.mockResolvedValue([
      { produtoNome: "A", localNome: "L", saldo: "1", dias: 30, vrSaldo: "100" },
    ]);
    await queryProdutosParados(mockPrisma as never, {});
    expect(mockPrisma.fatoProdutoParado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ dias: "desc" }, { saldoHojeId: "asc" }],
      }),
    );
  });

  it("pagina via take/skip e calcula kpis com count/aggregate quando limit dado", async () => {
    mockPrisma.fatoProdutoParado.findMany.mockResolvedValue([
      { produtoNome: "A", localNome: "L", saldo: "1", dias: 30, vrSaldo: "100" },
    ]);
    mockPrisma.fatoProdutoParado.count.mockResolvedValue(42);
    mockPrisma.fatoProdutoParado.aggregate.mockResolvedValue({ _sum: { vrSaldo: "9999" } });
    const result = await queryProdutosParados(mockPrisma as never, { limit: 10, offset: 20 });
    expect(mockPrisma.fatoProdutoParado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10, skip: 20 }),
    );
    expect(result.total).toBe(42);
    expect(result.kpis.totalParados).toBe(42);
    expect(result.kpis.valorImobilizado).toBe(9999);
  });
});

describe("queryTopMovimentados", () => {
  let mockPrisma: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    mockPrisma = createMockContext();
  });

  it("agrega por produtoNome, ordena por valor desc", async () => {
    mockPrisma.fatoEstoqueMovimento.groupBy.mockResolvedValue([
      { produtoNome: "A", _sum: { quantidade: 50 } },
      { produtoNome: "B", _sum: { quantidade: 80 } },
    ]);
    const result = await queryTopMovimentados(mockPrisma as never, {});
    expect(result.linhas[0]).toMatchObject({ rotulo: "B", valor: 80 });
    expect(result.linhas[1]).toMatchObject({ rotulo: "A", valor: 50 });
  });

  it("calcula KPIs totalProdutos e totalUnidades", async () => {
    mockPrisma.fatoEstoqueMovimento.groupBy.mockResolvedValue([
      { produtoNome: "A", _sum: { quantidade: 50 } },
      { produtoNome: "B", _sum: { quantidade: 80 } },
    ]);
    const result = await queryTopMovimentados(mockPrisma as never, {});
    expect(result.kpis.totalProdutos).toBe(2);
    expect(result.kpis.totalUnidades).toBe(130);
  });

  it("NÃO faz slice , devolve lista completa (slice é shaping do wrapper)", async () => {
    const grupos = Array.from({ length: 15 }, (_, i) => ({
      produtoNome: `P${i}`,
      _sum: { quantidade: 100 - i },
    }));
    mockPrisma.fatoEstoqueMovimento.groupBy.mockResolvedValue(grupos);
    const result = await queryTopMovimentados(mockPrisma as never, {});
    expect(result.linhas).toHaveLength(15);
  });
});

describe("queryConcentracao", () => {
  let mockPrisma: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    mockPrisma = createMockContext();
  });

  it("agrega vrSaldo por família e marca; nulos → 'Não classificado'", async () => {
    mockPrisma.fatoEstoqueSaldo.groupBy
      .mockResolvedValueOnce([
        { familiaNome: "Cardio", _sum: { vrSaldo: 600 } },
        { familiaNome: null, _sum: { vrSaldo: 400 } },
      ])
      .mockResolvedValueOnce([
        { marcaNome: "Matrix", _sum: { vrSaldo: 900 } },
      ]);
    const result = await queryConcentracao(mockPrisma as never);
    expect(result.familiasBruto).toContainEqual(expect.objectContaining({ rotulo: "Não classificado" }));
    expect(result.marcasBruto).toContainEqual(expect.objectContaining({ rotulo: "Matrix" }));
  });

  it("NÃO inclui percentual no núcleo (shaping fica no wrapper/tool)", async () => {
    mockPrisma.fatoEstoqueSaldo.groupBy
      .mockResolvedValueOnce([{ familiaNome: "Cardio", _sum: { vrSaldo: 100 } }])
      .mockResolvedValueOnce([{ marcaNome: "Matrix", _sum: { vrSaldo: 100 } }]);
    const result = await queryConcentracao(mockPrisma as never);
    expect(result.familiasBruto[0]).not.toHaveProperty("percentual");
    expect(result.marcasBruto[0]).not.toHaveProperty("percentual");
  });

  it("ordena familiasBruto e marcasBruto por valor desc", async () => {
    mockPrisma.fatoEstoqueSaldo.groupBy
      .mockResolvedValueOnce([
        { familiaNome: "A", _sum: { vrSaldo: 200 } },
        { familiaNome: "B", _sum: { vrSaldo: 800 } },
      ])
      .mockResolvedValueOnce([{ marcaNome: "M", _sum: { vrSaldo: 500 } }]);
    const result = await queryConcentracao(mockPrisma as never);
    expect(result.familiasBruto[0]!.valor).toBeGreaterThan(result.familiasBruto[1]!.valor);
  });
});
