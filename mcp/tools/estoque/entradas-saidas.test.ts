// mcp/tools/estoque/entradas-saidas.test.ts
import { estoqueEntradasSaidas } from "./entradas-saidas.js";
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

describe("estoque_entradas_saidas", () => {
  it("devolve estado:'preparando' quando FatoBuildState ausente", async () => {
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([]);
    const result = await estoqueEntradasSaidas.handler({}, ctx);
    expect(result).toEqual({ estado: "preparando" });
  });

  it("devolve dados com apenas a série (shape omite detalhe)", async () => {
    const now = new Date("2026-05-01T12:00:00Z");
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_estoque_movimento", ultimoBuildAt: now },
    ]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "estoque.extrato", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
    ]);
    (ctx.prisma.fatoEstoqueMovimento.groupBy as jest.Mock)
      .mockResolvedValueOnce([
        { mes: "2026-03", sentido: "entrada", _sum: { quantidade: 10 } },
      ])
      .mockResolvedValueOnce([]);
    const result = await estoqueEntradasSaidas.handler({ periodoDe: "2026-01", periodoAte: "2026-03" }, ctx);
    expect(result).toMatchObject({ estado: "ok" });
    if (result.estado !== "preparando") {
      expect(result.dados.serie).toHaveLength(1);
      expect(result.dados).not.toHaveProperty("detalhe");
    }
  });

  it("assertToolAllowed nega viewer sem domínio estoque", () => {
    const viewer: UserContext = { userId: "u2", role: "viewer", domains: [] } as UserContext;
    expect(() => assertToolAllowed(estoqueEntradasSaidas, viewer)).toThrow();
  });
});
