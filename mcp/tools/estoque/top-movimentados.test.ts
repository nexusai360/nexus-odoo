// mcp/tools/estoque/top-movimentados.test.ts
import { estoqueTopMovimentados } from "./top-movimentados.js";
import { assertToolAllowed } from "../../catalog/registry.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoEstoqueMovimento: { groupBy: jest.fn() },
  };
}

function makeCtx(role = "admin", domains: string[] = ["estoque"]): ToolHandlerCtx {
  return {
    prisma: makePrisma() as never,
    user: { userId: "u1", role, domains } as UserContext,
  };
}

describe("estoque_top_movimentados", () => {
  it("devolve estado:'preparando' quando FatoBuildState ausente", async () => {
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([]);
    const result = await estoqueTopMovimentados.handler({}, ctx);
    expect(result).toEqual({ estado: "preparando" });
  });

  it("devolve top-20 movimentados como 'top'", async () => {
    const now = new Date("2026-05-01T12:00:00Z");
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_estoque_movimento", ultimoBuildAt: now },
    ]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "estoque.extrato", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
    ]);
    // 25 produtos — espera top-20
    const grupos = Array.from({ length: 25 }, (_, i) => ({
      produtoNome: `P${i}`,
      _sum: { quantidade: 100 - i },
    }));
    (ctx.prisma.fatoEstoqueMovimento.groupBy as jest.Mock).mockResolvedValue(grupos);
    const result = await estoqueTopMovimentados.handler({}, ctx);
    expect(result).toMatchObject({ estado: "ok" });
    if (result.estado !== "preparando") {
      expect(result.dados.top).toHaveLength(20);
      expect(result.dados.kpis.totalProdutos).toBe(25);
    }
  });

  it("assertToolAllowed nega viewer sem domínio estoque", () => {
    const viewer: UserContext = { userId: "u2", role: "viewer", domains: [] } as UserContext;
    expect(() => assertToolAllowed(estoqueTopMovimentados as never, viewer)).toThrow();
  });
});
