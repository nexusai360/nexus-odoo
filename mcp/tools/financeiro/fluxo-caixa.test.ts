// mcp/tools/financeiro/fluxo-caixa.test.ts
import { financeiroFluxoCaixa } from "./fluxo-caixa.js";
import { assertToolAllowed } from "../../catalog/registry.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoFinanceiroMovimento: { findMany: jest.fn() },
    ...overrides,
  };
}

function makeCtx(role = "admin", domains: string[] = ["financeiro"]): ToolHandlerCtx {
  return {
    prisma: makePrisma() as never,
    user: { userId: "u1", role, domains } as UserContext,
  };
}

describe("financeiro_fluxo_caixa", () => {
  it("devolve estado:'preparando' quando FatoBuildState ausente", async () => {
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([]);
    const result = await financeiroFluxoCaixa.handler({}, ctx);
    expect(result).toEqual({ estado: "preparando" });
  });

  it("devolve estado:'ok' com série mensal", async () => {
    const now = new Date("2026-05-18T10:00:00Z");
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_financeiro_movimento", ultimoBuildAt: now },
    ]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "finan.fluxo.caixa", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
    ]);
    (ctx.prisma.fatoFinanceiroMovimento.findMany as jest.Mock).mockResolvedValue([
      { data: new Date("2026-01-15"), valor: "500", valorPrevisto: "600" },
    ]);
    const result = await financeiroFluxoCaixa.handler({}, ctx);
    expect(result).toMatchObject({ estado: "ok" });
    if (result.estado !== "preparando") {
      expect(result.dados.serie).toHaveLength(1);
      expect(result.dados.serie[0]).toEqual({ periodo: "2026-01", realizado: 500, previsto: 600 });
    }
  });

  it("devolve estado:'vazio' quando serie vazia", async () => {
    const now = new Date("2026-05-18T10:00:00Z");
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_financeiro_movimento", ultimoBuildAt: now },
    ]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "finan.fluxo.caixa", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
    ]);
    (ctx.prisma.fatoFinanceiroMovimento.findMany as jest.Mock).mockResolvedValue([]);
    const result = await financeiroFluxoCaixa.handler({}, ctx);
    expect(result).toMatchObject({ estado: "vazio" });
  });

  it("assertToolAllowed nega viewer sem domínio financeiro", () => {
    const viewer: UserContext = { userId: "u2", role: "viewer", domains: [] } as UserContext;
    expect(() => assertToolAllowed(financeiroFluxoCaixa as never, viewer)).toThrow();
  });
});
