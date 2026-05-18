// mcp/tools/financeiro/contas-a-receber.test.ts
import { financeiroContasAReceber } from "./contas-a-receber.js";
import { assertToolAllowed } from "../../catalog/registry.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoFinanceiroTitulo: { findMany: jest.fn() },
    ...overrides,
  };
}

function makeCtx(role = "admin", domains: string[] = ["financeiro"]): ToolHandlerCtx {
  return {
    prisma: makePrisma() as never,
    user: { userId: "u1", role, domains } as UserContext,
  };
}

describe("financeiro_contas_a_receber", () => {
  it("devolve estado:'preparando' quando FatoBuildState ausente", async () => {
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([]);
    const result = await financeiroContasAReceber.handler({}, ctx);
    expect(result).toEqual({ estado: "preparando" });
  });

  it("devolve dados com dataVencimento serializada como ISO string", async () => {
    const now = new Date("2026-05-18T10:00:00Z");
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_financeiro_titulo", ultimoBuildAt: now },
    ]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "finan.pagamento.divida", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
    ]);
    (ctx.prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([
      {
        participanteNome: "Empresa A",
        numeroDocumento: "NF-001",
        dataVencimento: new Date("2026-05-10"),
        vrSaldo: "500.00",
      },
    ]);
    const result = await financeiroContasAReceber.handler({}, ctx);
    expect(result).toMatchObject({ estado: "ok" });
    if (result.estado !== "preparando") {
      expect(result.dados.titulos[0].dataVencimento).toBe("2026-05-10T00:00:00.000Z");
      expect(result.dados.titulos[0].vrSaldo).toBe(500);
      expect(result.dados.titulos[0].diasAtraso).toBeGreaterThanOrEqual(0);
    }
  });

  it("dataVencimento null é serializada como null", async () => {
    const now = new Date("2026-05-18T10:00:00Z");
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_financeiro_titulo", ultimoBuildAt: now },
    ]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "finan.pagamento.divida", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
    ]);
    (ctx.prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([
      { participanteNome: null, numeroDocumento: null, dataVencimento: null, vrSaldo: "100.00" },
    ]);
    const result = await financeiroContasAReceber.handler({}, ctx);
    if (result.estado !== "preparando") {
      expect(result.dados.titulos[0].dataVencimento).toBeNull();
      expect(result.dados.titulos[0].diasAtraso).toBe(0);
    }
  });

  // Regressão: o critério correto é situacaoSimples='aberto', não dataPagamento=null.
  // O banco filtra antes de devolver — o mock simula banco com só títulos abertos.
  it("título aberto (situacaoSimples='aberto') aparece no resultado", async () => {
    const now = new Date("2026-05-18T10:00:00Z");
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_financeiro_titulo", ultimoBuildAt: now },
    ]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "finan.pagamento.divida", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
    ]);
    // Mock simula o banco já tendo filtrado por situacaoSimples='aberto'
    (ctx.prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([
      { participanteNome: "Empresa A", numeroDocumento: "NF-001", dataVencimento: new Date("2026-05-10"), vrSaldo: "500.00" },
    ]);
    const result = await financeiroContasAReceber.handler({}, ctx);
    if (result.estado !== "preparando") {
      expect(result.dados.titulos).toHaveLength(1);
      expect(result.dados.totalAReceber).toBe(500);
    }
  });

  it("quando banco devolve vazio (todos quitados), resultado é estado:'vazio'", async () => {
    const now = new Date("2026-05-18T10:00:00Z");
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_financeiro_titulo", ultimoBuildAt: now },
    ]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "finan.pagamento.divida", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
    ]);
    // Mock simula banco sem nenhum título aberto (todos quitados foram filtrados)
    (ctx.prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([]);
    const result = await financeiroContasAReceber.handler({}, ctx);
    expect(result.estado).toBe("vazio");
  });

  it("assertToolAllowed nega viewer sem domínio financeiro", () => {
    const viewer: UserContext = { userId: "u2", role: "viewer", domains: [] } as UserContext;
    expect(() => assertToolAllowed(financeiroContasAReceber as never, viewer)).toThrow();
  });
});
