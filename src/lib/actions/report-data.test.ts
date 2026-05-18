jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/actions/domain-access", () => ({ getMyDomains: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    fatoBuildState: { findUnique: jest.fn() },
    fatoEstoqueSaldo: { findMany: jest.fn(), groupBy: jest.fn() },
    fatoEstoqueMovimento: { groupBy: jest.fn(), findMany: jest.fn() },
    fatoProdutoParado: { findMany: jest.fn(), count: jest.fn() },
    syncState: { findUnique: jest.fn() },
  },
}));
// Mock do núcleo de estoque — os wrappers delegam para ele.
// As funções são adicionadas conforme cada task -extr é concluída.
jest.mock("@/lib/reports/queries/estoque", () => ({
  querySaldoProduto: jest.fn(),
  queryValorArmazem: jest.fn(),
  queryEntradasSaidas: jest.fn(),
  queryProdutosParados: jest.fn(),
  queryTopMovimentados: jest.fn(),
  queryConcentracao: jest.fn(),
}));
import { getCurrentUser } from "@/lib/auth";
import type { AuthUser } from "@/lib/auth-helpers";
import { getMyDomains } from "@/lib/actions/domain-access";
import { prisma } from "@/lib/prisma";
import {
  getRelatorioSaldoProduto, getRelatorioValorPorArmazem,
  getRelatorioEntradasSaidas, getRelatorioProdutoParado,
  getRelatorioTopMovimentados, getRelatorioConcentracao,
} from "./report-data";

// Referências tipadas aos mocks do núcleo de estoque
 
const estoqueNucleoMock = jest.requireMock("@/lib/reports/queries/estoque") as {
  querySaldoProduto: jest.Mock;
  queryValorArmazem: jest.Mock;
  queryEntradasSaidas: jest.Mock;
  queryProdutosParados: jest.Mock;
  queryTopMovimentados: jest.Mock;
  queryConcentracao: jest.Mock;
};

const mockGetCurrentUser = jest.mocked(getCurrentUser);
const mockGetMyDomains = jest.mocked(getMyDomains);

/**
 * O `prisma` importado é tipado como `PrismaClient` (métodos com overloads
 * genéricos), mas o `jest.mock` acima troca cada método por um `jest.fn()`.
 * Este cast expõe os métodos usados nos testes como `jest.Mock` simples.
 */
const mockPrisma = prisma as unknown as {
  fatoBuildState: { findUnique: jest.Mock };
  fatoEstoqueSaldo: { findMany: jest.Mock; groupBy: jest.Mock };
  fatoEstoqueMovimento: { groupBy: jest.Mock; findMany: jest.Mock };
  fatoProdutoParado: { findMany: jest.Mock; count: jest.Mock };
  syncState: { findUnique: jest.Mock };
};

// Aliases curtos para os mocks do núcleo
const mockQuerySaldoProduto = () => estoqueNucleoMock.querySaldoProduto;
const mockQueryValorArmazem = () => estoqueNucleoMock.queryValorArmazem;
const mockQueryEntradasSaidas = () => estoqueNucleoMock.queryEntradasSaidas;
const mockQueryProdutosParados = () => estoqueNucleoMock.queryProdutosParados;
const mockQueryTopMovimentados = () => estoqueNucleoMock.queryTopMovimentados;
const mockQueryConcentracao = () => estoqueNucleoMock.queryConcentracao;

beforeEach(() => {
  mockGetCurrentUser.mockResolvedValue({ id: "u1", platformRole: "admin" } as AuthUser);
  mockGetMyDomains.mockResolvedValue(["estoque"]);
  mockPrisma.syncState.findUnique.mockResolvedValue({ lastSnapshotAt: new Date() });
  jest.clearAllMocks();
  // Restaurar user/domains após clearAllMocks
  mockGetCurrentUser.mockResolvedValue({ id: "u1", platformRole: "admin" } as AuthUser);
  mockGetMyDomains.mockResolvedValue(["estoque"]);
  mockPrisma.syncState.findUnique.mockResolvedValue({ lastSnapshotAt: new Date() });
});

describe("getRelatorioSaldoProduto (R1)", () => {
  it("estado 'preparando' quando FatoBuildState ausente", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue(null);
    const r = await getRelatorioSaldoProduto({});
    expect(r.estado).toBe("preparando");
    expect(mockQuerySaldoProduto()).not.toHaveBeenCalled();
  });
  it("estado 'vazio' quando o builder rodou mas não há linhas", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    mockQuerySaldoProduto().mockResolvedValue({
      kpis: { totalProdutos: 0, produtosNegativos: 0, valorTotal: 0 },
      linhas: [],
    });
    const r = await getRelatorioSaldoProduto({});
    expect(r.estado).toBe("vazio");
    expect(r.freshness).toBeDefined();
  });
  it("estado 'ok' quando há linhas; freshness presente", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    mockQuerySaldoProduto().mockResolvedValue({
      kpis: { totalProdutos: 1, produtosNegativos: 0, valorTotal: 500 },
      linhas: [
        { produtoNome: "Esteira", familiaNome: null, marcaNome: null, saldoTotal: 3, valorTotal: 500, numLocais: 1, detalhePorLocal: [] },
      ],
    });
    const r = await getRelatorioSaldoProduto({});
    expect(r.estado).toBe("ok");
    expect(r.freshness).toBeDefined();
  });
  it("estado 'erro' quando dependência lança", async () => {
    mockPrisma.fatoBuildState.findUnique.mockRejectedValue(new Error("db fail"));
    const r = await getRelatorioSaldoProduto({});
    expect(r.estado).toBe("erro");
    expect(r.freshness).toBeNull();
  });
  it("delega para querySaldoProduto com os filtros corretos", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    mockQuerySaldoProduto().mockResolvedValue({
      kpis: { totalProdutos: 0, produtosNegativos: 0, valorTotal: 0 },
      linhas: [],
    });
    await getRelatorioSaldoProduto({ familiaId: 7, armazemId: 3 });
    expect(mockQuerySaldoProduto()).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ familiaId: 7, armazemId: 3 }),
    );
  });
});

describe("getRelatorioValorPorArmazem (R2)", () => {
  it("estado 'preparando' quando FatoBuildState ausente", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue(null);
    const r = await getRelatorioValorPorArmazem({});
    expect(r.estado).toBe("preparando");
    expect(mockQueryValorArmazem()).not.toHaveBeenCalled();
  });
  it("estado 'vazio' quando não há linhas", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    mockQueryValorArmazem().mockResolvedValue({ kpis: { valorTotal: 0, numArmazens: 0 }, linhasBruto: [] });
    const r = await getRelatorioValorPorArmazem({});
    expect(r.estado).toBe("vazio");
    expect(r.freshness).toBeDefined();
  });
  it("wrapper calcula percentual e top8 a partir do núcleo", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    mockQueryValorArmazem().mockResolvedValue({
      kpis: { valorTotal: 1400, numArmazens: 2 },
      linhasBruto: [
        { armazem: "Galpão A", valor: 1000, numProdutos: 1 },
        { armazem: "Virtual", valor: 400, numProdutos: 1 },
      ],
    });
    const r = await getRelatorioValorPorArmazem({});
    expect(r.estado).toBe("ok");
    expect(r.dados.linhas[0]).toMatchObject({ armazem: "Galpão A", valor: 1000 });
    expect(r.dados.linhas[0]!.percentual).toBeCloseTo((1000 / 1400) * 100, 5);
    expect(r.dados.top8).toHaveLength(2);
    expect(r.freshness).toBeDefined();
  });
  it("estado 'erro' quando dependência lança", async () => {
    mockPrisma.fatoBuildState.findUnique.mockRejectedValue(new Error("db fail"));
    const r = await getRelatorioValorPorArmazem({});
    expect(r.estado).toBe("erro");
  });
});

describe("getRelatorioEntradasSaidas (R3)", () => {
  it("estado 'preparando' quando FatoBuildState ausente", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue(null);
    const r = await getRelatorioEntradasSaidas({});
    expect(r.estado).toBe("preparando");
    expect(r.dados.serie).toEqual([]);
    expect(r.dados.detalhe).toEqual([]);
    expect(mockQueryEntradasSaidas()).not.toHaveBeenCalled();
  });
  it("estado 'ok' e 'vazio' baseado em serie.length (não linhas)", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    mockQueryEntradasSaidas().mockResolvedValue({ serie: [], detalhe: [] });
    const r = await getRelatorioEntradasSaidas({});
    expect(r.estado).toBe("vazio");
  });
  it("estado 'ok' quando há serie; freshness presente", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    mockQueryEntradasSaidas().mockResolvedValue({
      serie: [{ mes: "2026-03", entrada: 10, saida: 4 }],
      detalhe: [],
    });
    const r = await getRelatorioEntradasSaidas({ periodoDe: "2026-01", periodoAte: "2026-03" });
    expect(r.estado).toBe("ok");
    expect(r.freshness).toBeDefined();
  });
  it("estado 'erro' quando dependência lança", async () => {
    mockPrisma.fatoBuildState.findUnique.mockRejectedValue(new Error("db fail"));
    const r = await getRelatorioEntradasSaidas({});
    expect(r.estado).toBe("erro");
  });
});

describe("getRelatorioProdutoParado (R4)", () => {
  it("estado 'preparando' quando FatoBuildState ausente", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue(null);
    const r = await getRelatorioProdutoParado({});
    expect(r.estado).toBe("preparando");
    expect(r.dados.kpis.totalParados).toBe(0);
    expect(r.dados.kpis.valorImobilizado).toBe(0);
    expect(mockQueryProdutosParados()).not.toHaveBeenCalled();
  });
  it("estado 'ok' quando há linhas; freshness presente", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    mockQueryProdutosParados().mockResolvedValue({
      kpis: { totalParados: 2, valorImobilizado: 700 },
      total: 2,
      linhas: [
        { produtoNome: "X", localNome: "A", saldo: 3, dias: 95, vrSaldo: 200 },
        { produtoNome: "Y", localNome: "B", saldo: 1, dias: 120, vrSaldo: 500 },
      ],
    });
    const r = await getRelatorioProdutoParado({ faixaDias: 90 });
    expect(r.estado).toBe("ok");
    expect(r.dados.total).toBe(2);
    expect(r.dados.kpis.valorImobilizado).toBe(700);
    expect(r.freshness).toBeDefined();
  });
  it("estado 'vazio' quando não há linhas", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    mockQueryProdutosParados().mockResolvedValue({ kpis: { totalParados: 0, valorImobilizado: 0 }, total: 0, linhas: [] });
    const r = await getRelatorioProdutoParado({});
    expect(r.estado).toBe("vazio");
  });
  it("estado 'erro' quando dependência lança", async () => {
    mockPrisma.fatoBuildState.findUnique.mockRejectedValue(new Error("db fail"));
    const r = await getRelatorioProdutoParado({});
    expect(r.estado).toBe("erro");
  });
});

describe("getRelatorioTopMovimentados (R5)", () => {
  it("estado 'preparando' quando FatoBuildState ausente", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue(null);
    const r = await getRelatorioTopMovimentados({});
    expect(r.estado).toBe("preparando");
    expect(r.dados.barras).toEqual([]);
    expect(r.dados.linhas).toEqual([]);
    expect(r.dados.kpis.totalProdutos).toBe(0);
    expect(mockQueryTopMovimentados()).not.toHaveBeenCalled();
  });
  it("wrapper aplica barras = linhas.slice(0, TOP_N); freshness presente", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    const linhas = Array.from({ length: 15 }, (_, i) => ({
      rotulo: `P${i}`,
      valor: 100 - i,
    }));
    mockQueryTopMovimentados().mockResolvedValue({
      kpis: { totalProdutos: 15, totalUnidades: 1000 },
      linhas,
    });
    const r = await getRelatorioTopMovimentados({ sentido: "entrada" });
    expect(r.estado).toBe("ok");
    expect(r.dados.barras).toHaveLength(10); // TOP_N = 10
    expect(r.dados.linhas).toHaveLength(15);
    expect(r.freshness).toBeDefined();
  });
  it("estado 'vazio' quando não há linhas", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    mockQueryTopMovimentados().mockResolvedValue({ kpis: { totalProdutos: 0, totalUnidades: 0 }, linhas: [] });
    const r = await getRelatorioTopMovimentados({});
    expect(r.estado).toBe("vazio");
  });
  it("estado 'erro' quando dependência lança", async () => {
    mockPrisma.fatoBuildState.findUnique.mockRejectedValue(new Error("db fail"));
    const r = await getRelatorioTopMovimentados({});
    expect(r.estado).toBe("erro");
  });
});

describe("getRelatorioConcentracao (R6)", () => {
  it("estado 'preparando' quando FatoBuildState ausente", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue(null);
    const r = await getRelatorioConcentracao({});
    expect(r.estado).toBe("preparando");
    expect(r.dados.tabelaFamilia).toEqual([]);
    expect(r.dados.tabelaMarca).toEqual([]);
    expect(mockQueryConcentracao()).not.toHaveBeenCalled();
  });
  it("wrapper calcula percentual de tabelaFamilia e tabelaMarca", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    mockQueryConcentracao().mockResolvedValue({
      familiasBruto: [
        { rotulo: "Cardio", valor: 600 },
        { rotulo: "Musculação", valor: 400 },
      ],
      marcasBruto: [
        { rotulo: "Matrix", valor: 700 },
        { rotulo: "Life Fitness", valor: 300 },
      ],
    });
    const r = await getRelatorioConcentracao({});
    expect(r.estado).toBe("ok");
    expect(r.dados.tabelaFamilia[0]).toMatchObject({ familia: "Cardio", valor: 600, percentual: 60 });
    expect(r.dados.tabelaFamilia[1]).toMatchObject({ familia: "Musculação", valor: 400, percentual: 40 });
    expect(r.dados.tabelaMarca[0]).toMatchObject({ marca: "Matrix", valor: 700, percentual: 70 });
    expect(r.freshness).toBeDefined();
  });
  it("estado 'vazio' quando não há família nem marca", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    mockQueryConcentracao().mockResolvedValue({ familiasBruto: [], marcasBruto: [] });
    const r = await getRelatorioConcentracao({});
    expect(r.estado).toBe("vazio");
  });
  it("estado 'erro' quando dependência lança", async () => {
    mockPrisma.fatoBuildState.findUnique.mockRejectedValue(new Error("db fail"));
    const r = await getRelatorioConcentracao({});
    expect(r.estado).toBe("erro");
  });
});
