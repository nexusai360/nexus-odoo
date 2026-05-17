jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/actions/domain-access", () => ({ getMyDomains: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    fatoBuildState: { findUnique: jest.fn() },
    fatoEstoqueSaldo: { findMany: jest.fn(), groupBy: jest.fn() },
    syncState: { findUnique: jest.fn() },
  },
}));
const { getCurrentUser } = require("@/lib/auth");
const { getMyDomains } = require("@/lib/actions/domain-access");
const { prisma } = require("@/lib/prisma");
import { getRelatorioSaldoProduto, getRelatorioValorPorArmazem } from "./report-data";

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
