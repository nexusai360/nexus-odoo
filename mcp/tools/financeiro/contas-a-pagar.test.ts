// mcp/tools/financeiro/contas-a-pagar.test.ts
import { financeiroContasAPagar } from "./contas-a-pagar.js";
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

describe("financeiro_contas_a_pagar", () => {
  it("devolve estado:'preparando' quando FatoBuildState ausente", async () => {
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([]);
    const result = await financeiroContasAPagar.handler({}, ctx);
    expect(result).toEqual({ estado: "preparando" });
  });

  it("devolve dados com totalAPagar e dataVencimento como ISO", async () => {
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
        participanteNome: "Fornecedor X",
        numeroDocumento: "BOL-001",
        dataVencimento: new Date("2026-05-15"),
        vrTotal: "1000.00",
      },
    ]);
    const result = await financeiroContasAPagar.handler({}, ctx);
    expect(result).toMatchObject({ estado: "ok" });
    if (result.estado !== "preparando") {
      expect(result.dados.titulos[0].dataVencimento).toBe("2026-05-15T00:00:00.000Z");
      expect(result.dados.titulos[0].vrTotal).toBe(1000);
      expect(result.dados.totalAPagar).toBe(1000);
    }
  });

  // Regressão: o critério correto é situacaoSimples='aberto', não dataPagamento=null.
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
      { participanteNome: "Fornecedor X", numeroDocumento: "BOL-001", dataVencimento: new Date("2026-05-15"), vrTotal: "1000.00" },
    ]);
    const result = await financeiroContasAPagar.handler({}, ctx);
    if (result.estado !== "preparando") {
      expect(result.dados.titulos).toHaveLength(1);
      expect(result.dados.totalAPagar).toBe(1000);
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
    // Mock simula banco sem nenhum título aberto
    (ctx.prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([]);
    const result = await financeiroContasAPagar.handler({}, ctx);
    expect(result.estado).toBe("vazio");
  });

  it("assertToolAllowed nega viewer sem domínio financeiro", () => {
    const viewer: UserContext = { userId: "u2", role: "viewer", domains: [] } as UserContext;
    expect(() => assertToolAllowed(financeiroContasAPagar as never, viewer)).toThrow();
  });
});
