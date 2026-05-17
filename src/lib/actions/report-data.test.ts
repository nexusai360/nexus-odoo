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
import { getCurrentUser } from "@/lib/auth";
import type { AuthUser } from "@/lib/auth-helpers";
import { getMyDomains } from "@/lib/actions/domain-access";
import { prisma } from "@/lib/prisma";
import {
  getRelatorioSaldoProduto, getRelatorioValorPorArmazem,
  getRelatorioEntradasSaidas, getRelatorioProdutoParado,
  getRelatorioTopMovimentados, getRelatorioConcentracao,
} from "./report-data";

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

beforeEach(() => {
  mockGetCurrentUser.mockResolvedValue({ id: "u1", platformRole: "admin" } as AuthUser);
  mockGetMyDomains.mockResolvedValue(["estoque"]);
  mockPrisma.syncState.findUnique.mockResolvedValue({ lastSnapshotAt: new Date() });
});

describe("getRelatorioSaldoProduto (R1)", () => {
  it("estado 'preparando' quando FatoBuildState ausente", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue(null);
    const r = await getRelatorioSaldoProduto({});
    expect(r.estado).toBe("preparando");
  });
  it("estado 'vazio' quando o builder rodou mas não há linhas", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    mockPrisma.fatoEstoqueSaldo.findMany.mockResolvedValue([]);
    const r = await getRelatorioSaldoProduto({});
    expect(r.estado).toBe("vazio");
  });
  it("filtra por família quando familiaId é passado", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    mockPrisma.fatoEstoqueSaldo.findMany.mockResolvedValue([{ produtoNome: "X" }]);
    await getRelatorioSaldoProduto({ familiaId: 7 });
    expect(mockPrisma.fatoEstoqueSaldo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ familiaId: 7 }) }),
    );
  });
  it("inclui detalhePorLocal com rotulo limpo por limparNomeLocal", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
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
    const r = await getRelatorioSaldoProduto({});
    expect(r.estado).toBe("ok");
    const linha = r.dados.linhas[0]!;
    expect(linha.saldoTotal).toBe(7);
    expect(linha.detalhePorLocal).toHaveLength(2);
    // "Galpão A » Próprio" deve virar "Galpão A" (via limparNomeLocal)
    expect(linha.detalhePorLocal.some((d) => d.localRotulo === "Galpão A")).toBe(true);
    expect(linha.detalhePorLocal.some((d) => d.localRotulo === "Virtual")).toBe(true);
  });
});

describe("getRelatorioValorPorArmazem (R2)", () => {
  it("agrega valor e nº de produtos por armazém, com KPIs e top8", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    mockPrisma.fatoEstoqueSaldo.findMany.mockResolvedValue([
      { localNome: "Galpão A » Próprio", produtoId: 1, vrSaldo: 1000 },
      { localNome: "Virtual", produtoId: 2, vrSaldo: 400 },
    ]);
    const r = await getRelatorioValorPorArmazem({});
    expect(r.estado).toBe("ok");
    const dados = r.dados as {
      kpis: { valorTotal: number; numArmazens: number };
      linhas: { armazem: string; valor: number }[];
      top8: unknown[];
    };
    expect(dados.kpis.valorTotal).toBe(1400);
    expect(dados.kpis.numArmazens).toBe(2);
    expect(dados.linhas).toHaveLength(2);
    expect(dados.linhas[0]).toMatchObject({ armazem: "Galpão A", valor: 1000 });
    expect(mockPrisma.fatoEstoqueSaldo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { vrSaldo: { gt: 0 } } }),
    );
  });
});

describe("getRelatorioEntradasSaidas (R3)", () => {
  it("devolve série agregada por mês e detalhe por mês×sentido×produto", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    // Primeira chamada: groupBy mes×sentido (série)
    mockPrisma.fatoEstoqueMovimento.groupBy
      .mockResolvedValueOnce([
        { mes: "2026-03", sentido: "entrada", _sum: { quantidade: 10 } },
        { mes: "2026-03", sentido: "saida", _sum: { quantidade: 4 } },
      ])
      // Segunda chamada: groupBy mes×sentido×produtoNome (detalhe)
      .mockResolvedValueOnce([
        { mes: "2026-03", sentido: "entrada", produtoNome: "Esteira", _sum: { quantidade: 6 } },
        { mes: "2026-03", sentido: "entrada", produtoNome: "Bike", _sum: { quantidade: 4 } },
        { mes: "2026-03", sentido: "saida", produtoNome: "Esteira", _sum: { quantidade: 4 } },
      ]);
    const r = await getRelatorioEntradasSaidas({ periodoDe: "2026-01", periodoAte: "2026-03" });
    expect(r.estado).toBe("ok");
    expect(r.dados.serie).toEqual([{ mes: "2026-03", entrada: 10, saida: 4 }]);
    expect(r.dados.detalhe).toHaveLength(3);
    expect(r.dados.detalhe[0]).toMatchObject({ mes: "2026-03", sentido: "entrada", produto: "Esteira", quantidade: 6 });
  });

  it("estado 'preparando' quando FatoBuildState ausente", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue(null);
    const r = await getRelatorioEntradasSaidas({});
    expect(r.estado).toBe("preparando");
    expect(r.dados.serie).toEqual([]);
    expect(r.dados.detalhe).toEqual([]);
  });

  it("produtoNome null vira 'Sem produto' no detalhe", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    mockPrisma.fatoEstoqueMovimento.groupBy
      .mockResolvedValueOnce([
        { mes: "2026-03", sentido: "entrada", _sum: { quantidade: 5 } },
      ])
      .mockResolvedValueOnce([
        { mes: "2026-03", sentido: "entrada", produtoNome: null, _sum: { quantidade: 5 } },
      ]);
    const r = await getRelatorioEntradasSaidas({});
    expect(r.dados.detalhe[0]?.produto).toBe("Sem produto");
  });
});

describe("getRelatorioProdutoParado (R4)", () => {
  it("filtra faixa de dias e saldo > 0; devolve KPIs + tabela", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    mockPrisma.fatoProdutoParado.findMany.mockResolvedValue([
      { produtoNome: "X", localNome: "A", saldo: 3, dias: 95, vrSaldo: 200 },
      { produtoNome: "Y", localNome: "B", saldo: 1, dias: 120, vrSaldo: 500 },
    ]);
    const r = await getRelatorioProdutoParado({ faixaDias: 90 });
    expect(r.estado).toBe("ok");
    expect(r.dados.total).toBe(2);
    expect(r.dados.linhas).toHaveLength(2);
    expect(r.dados.kpis.totalParados).toBe(2);
    expect(r.dados.kpis.valorImobilizado).toBe(700);
    expect(mockPrisma.fatoProdutoParado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ saldo: { gt: 0 }, dias: { gte: 90 } }),
      }),
    );
  });
  it("estado 'preparando' quando FatoBuildState ausente", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue(null);
    const r = await getRelatorioProdutoParado({});
    expect(r.estado).toBe("preparando");
    expect(r.dados.kpis.totalParados).toBe(0);
    expect(r.dados.kpis.valorImobilizado).toBe(0);
  });
});

describe("getRelatorioTopMovimentados (R5)", () => {
  it("agrega por produto, ordena desc, aplica top-N em barras e devolve KPIs", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    mockPrisma.fatoEstoqueMovimento.groupBy.mockResolvedValue([
      { produtoNome: "A", _sum: { quantidade: 50 } },
      { produtoNome: "B", _sum: { quantidade: 80 } },
      { produtoNome: "C", _sum: { quantidade: 30 } },
    ]);
    const r = await getRelatorioTopMovimentados({ sentido: "entrada" });
    expect(r.estado).toBe("ok");
    expect(r.dados.barras[0]).toMatchObject({ rotulo: "B", valor: 80 });
    expect(r.dados.linhas).toHaveLength(3);
    expect(r.dados.kpis.totalProdutos).toBe(3);
    expect(r.dados.kpis.totalUnidades).toBe(160);
  });
  it("estado 'preparando' quando FatoBuildState ausente", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue(null);
    const r = await getRelatorioTopMovimentados({});
    expect(r.estado).toBe("preparando");
    expect(r.dados.barras).toEqual([]);
    expect(r.dados.linhas).toEqual([]);
    expect(r.dados.kpis.totalProdutos).toBe(0);
  });
});

describe("getRelatorioConcentracao (R6)", () => {
  it("agrega vrSaldo por família e por marca; nulos viram 'Não classificado'", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    mockPrisma.fatoEstoqueSaldo.groupBy
      .mockResolvedValueOnce([
        { familiaNome: "Esteiras", _sum: { vrSaldo: 100 } },
        { familiaNome: null, _sum: { vrSaldo: 30 } },
      ])
      .mockResolvedValueOnce([
        { marcaNome: "Matrix", _sum: { vrSaldo: 90 } },
      ]);
    const r = await getRelatorioConcentracao({});
    expect(r.dados.familia).toContainEqual({ rotulo: "Não classificado", valor: 30 });
    expect(r.dados.marca).toContainEqual({ rotulo: "Matrix", valor: 90 });
  });

  it("devolve tabelaFamilia com valor e percentual corretos", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    mockPrisma.fatoEstoqueSaldo.groupBy
      .mockResolvedValueOnce([
        { familiaNome: "Cardio", _sum: { vrSaldo: 600 } },
        { familiaNome: "Musculação", _sum: { vrSaldo: 400 } },
      ])
      .mockResolvedValueOnce([
        { marcaNome: "Matrix", _sum: { vrSaldo: 1000 } },
      ]);
    const r = await getRelatorioConcentracao({});
    expect(r.estado).toBe("ok");
    // tabelaFamilia deve ter 2 linhas ordenadas por valor desc
    expect(r.dados.tabelaFamilia).toHaveLength(2);
    expect(r.dados.tabelaFamilia[0]).toMatchObject({ familia: "Cardio", valor: 600, percentual: 60 });
    expect(r.dados.tabelaFamilia[1]).toMatchObject({ familia: "Musculação", valor: 400, percentual: 40 });
  });

  it("devolve tabelaMarca com valor e percentual corretos", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    mockPrisma.fatoEstoqueSaldo.groupBy
      .mockResolvedValueOnce([
        { familiaNome: "Cardio", _sum: { vrSaldo: 1000 } },
      ])
      .mockResolvedValueOnce([
        { marcaNome: "Matrix", _sum: { vrSaldo: 700 } },
        { marcaNome: "Life Fitness", _sum: { vrSaldo: 300 } },
      ]);
    const r = await getRelatorioConcentracao({});
    expect(r.dados.tabelaMarca).toHaveLength(2);
    expect(r.dados.tabelaMarca[0]).toMatchObject({ marca: "Matrix", valor: 700, percentual: 70 });
    expect(r.dados.tabelaMarca[1]).toMatchObject({ marca: "Life Fitness", valor: 300, percentual: 30 });
  });

  it("estado 'preparando' quando FatoBuildState ausente", async () => {
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue(null);
    const r = await getRelatorioConcentracao({});
    expect(r.estado).toBe("preparando");
    expect(r.dados.tabelaFamilia).toEqual([]);
    expect(r.dados.tabelaMarca).toEqual([]);
  });
});
