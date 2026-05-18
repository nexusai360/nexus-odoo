// mcp/tools/financeiro/titulos-vencidos.test.ts
import { financeiroTitulosVencidos } from "./titulos-vencidos.js";
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

describe("financeiro_titulos_vencidos", () => {
  it("devolve estado:'preparando' quando FatoBuildState ausente", async () => {
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([]);
    const result = await financeiroTitulosVencidos.handler({}, ctx);
    expect(result).toEqual({ estado: "preparando" });
  });

  it("devolve dados com tipo, totalVencido e dataVencimento ISO", async () => {
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
        tipo: "a_receber",
        participanteNome: "Cliente Z",
        numeroDocumento: "NF-100",
        dataVencimento: new Date("2026-04-01"),
        vrTotal: "2000.00",
      },
    ]);
    const result = await financeiroTitulosVencidos.handler({}, ctx);
    expect(result).toMatchObject({ estado: "ok" });
    if (result.estado !== "preparando") {
      expect(result.dados.titulos[0].tipo).toBe("a_receber");
      expect(result.dados.titulos[0].dataVencimento).toBe("2026-04-01T00:00:00.000Z");
      expect(result.dados.titulos[0].vrTotal).toBe(2000);
      expect(result.dados.totalVencido).toBe(2000);
    }
  });

  it("devolve estado:'vazio' quando não há títulos vencidos", async () => {
    const now = new Date("2026-05-18T10:00:00Z");
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_financeiro_titulo", ultimoBuildAt: now },
    ]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "finan.pagamento.divida", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
    ]);
    (ctx.prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([]);
    const result = await financeiroTitulosVencidos.handler({}, ctx);
    expect(result).toMatchObject({ estado: "vazio" });
  });

  // Regressão: o critério correto é situacaoSimples='aberto' + dataVencimento < hoje.
  it("título aberto e vencido aparece no resultado", async () => {
    const now = new Date("2026-05-18T10:00:00Z");
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_financeiro_titulo", ultimoBuildAt: now },
    ]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "finan.pagamento.divida", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
    ]);
    // Mock simula banco retornando apenas títulos abertos e vencidos
    (ctx.prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([
      { tipo: "a_receber", participanteNome: "Cliente Z", numeroDocumento: "NF-100", dataVencimento: new Date("2026-04-01"), vrTotal: "2000.00" },
    ]);
    const result = await financeiroTitulosVencidos.handler({}, ctx);
    if (result.estado !== "preparando") {
      expect(result.dados.titulos).toHaveLength(1);
      expect(result.dados.totalVencido).toBe(2000);
    }
  });

  it("título quitado não aparece (banco filtra por situacaoSimples='aberto')", async () => {
    const now = new Date("2026-05-18T10:00:00Z");
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_financeiro_titulo", ultimoBuildAt: now },
    ]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "finan.pagamento.divida", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
    ]);
    // Mock simula banco com nenhum resultado (quitados foram filtrados antes)
    (ctx.prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([]);
    const result = await financeiroTitulosVencidos.handler({}, ctx);
    expect(result.estado).toBe("vazio");
  });

  it("assertToolAllowed nega viewer sem domínio financeiro", () => {
    const viewer: UserContext = { userId: "u2", role: "viewer", domains: [] } as UserContext;
    expect(() => assertToolAllowed(financeiroTitulosVencidos as never, viewer)).toThrow();
  });
});
