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
const { getCurrentUser } = require("@/lib/auth");
const { getMyDomains } = require("@/lib/actions/domain-access");
const { prisma } = require("@/lib/prisma");
import {
  getRelatorioSaldoProduto, getRelatorioValorPorArmazem,
  getRelatorioEntradasSaidas, getRelatorioProdutoParado,
  getRelatorioTopMovimentados, getRelatorioConcentracao,
} from "./report-data";

beforeEach(() => {
  getCurrentUser.mockResolvedValue({ id: "u1", platformRole: "admin" });
  getMyDomains.mockResolvedValue(["estoque"]);
  prisma.syncState.findUnique.mockResolvedValue({ lastSnapshotAt: new Date() });
});

describe("getRelatorioSaldoProduto (R1)", () => {
  it("estado 'preparando' quando FatoBuildState ausente", async () => {
    prisma.fatoBuildState.findUnique.mockResolvedValue(null);
    const r = await getRelatorioSaldoProduto({});
    expect(r.estado).toBe("preparando");
  });
  it("estado 'vazio' quando o builder rodou mas não há linhas", async () => {
    prisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    prisma.fatoEstoqueSaldo.findMany.mockResolvedValue([]);
    const r = await getRelatorioSaldoProduto({});
    expect(r.estado).toBe("vazio");
  });
  it("filtra por família quando familiaId é passado", async () => {
    prisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    prisma.fatoEstoqueSaldo.findMany.mockResolvedValue([{ produtoNome: "X" }]);
    await getRelatorioSaldoProduto({ familiaId: 7 });
    expect(prisma.fatoEstoqueSaldo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ familiaId: 7 }) }),
    );
  });
});

describe("getRelatorioValorPorArmazem (R2)", () => {
  it("agrega vrSaldo por local com vrSaldo > 0", async () => {
    prisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    prisma.fatoEstoqueSaldo.groupBy.mockResolvedValue([
      { localNome: "Galpão A", _sum: { vrSaldo: 1000 } },
    ]);
    const r = await getRelatorioValorPorArmazem({});
    expect(r.estado).toBe("ok");
    expect(r.dados).toEqual([{ rotulo: "Galpão A", valor: 1000 }]);
    expect(prisma.fatoEstoqueSaldo.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { vrSaldo: { gt: 0 } } }),
    );
  });
});

describe("getRelatorioEntradasSaidas (R3)", () => {
  it("soma quantidade por mês e sentido dentro do período", async () => {
    prisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    prisma.fatoEstoqueMovimento.groupBy.mockResolvedValue([
      { mes: "2026-03", sentido: "entrada", _sum: { quantidade: 10 } },
      { mes: "2026-03", sentido: "saida", _sum: { quantidade: 4 } },
    ]);
    const r = await getRelatorioEntradasSaidas({ periodoDe: "2026-01", periodoAte: "2026-03" });
    expect(r.estado).toBe("ok");
    expect(r.dados).toEqual([{ mes: "2026-03", entrada: 10, saida: 4 }]);
  });
});

describe("getRelatorioProdutoParado (R4)", () => {
  it("filtra faixa de dias e saldo > 0; devolve KPI + tabela", async () => {
    prisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    prisma.fatoProdutoParado.findMany.mockResolvedValue([
      { produtoNome: "X", localNome: "A", saldo: 3, dias: 95, vrSaldo: 200 },
    ]);
    const r = await getRelatorioProdutoParado({ faixaDias: 90 });
    expect(r.estado).toBe("ok");
    expect(r.dados.total).toBe(1);
    expect(r.dados.linhas).toHaveLength(1);
    expect(prisma.fatoProdutoParado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ saldo: { gt: 0 }, dias: { gte: 90 } }),
      }),
    );
  });
});

describe("getRelatorioTopMovimentados (R5)", () => {
  it("agrega por produto, ordena desc e aplica top-N", async () => {
    prisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    prisma.fatoEstoqueMovimento.groupBy.mockResolvedValue([
      { produtoNome: "A", _sum: { quantidade: 50 } },
      { produtoNome: "B", _sum: { quantidade: 80 } },
    ]);
    const r = await getRelatorioTopMovimentados({ sentido: "entrada" });
    expect(r.dados[0]).toEqual({ rotulo: "B", valor: 80 });
  });
});

describe("getRelatorioConcentracao (R6)", () => {
  it("agrega vrSaldo por família e por marca; nulos viram 'Não classificado'", async () => {
    prisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    prisma.fatoEstoqueSaldo.groupBy
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
});
