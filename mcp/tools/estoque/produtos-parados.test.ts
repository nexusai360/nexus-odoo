// mcp/tools/estoque/produtos-parados.test.ts
import { estoqueProdutosParados } from "./produtos-parados.js";
import { assertToolAllowed } from "../../catalog/registry.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoProdutoParado: { findMany: jest.fn() },
  };
}

function makeCtx(role = "admin", domains: string[] = ["estoque"]): ToolHandlerCtx {
  return {
    prisma: makePrisma() as never,
    user: { userId: "u1", role, domains } as UserContext,
  };
}

describe("estoque_produtos_parados", () => {
  it("devolve estado:'preparando' quando FatoBuildState ausente", async () => {
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([]);
    const result = await estoqueProdutosParados.handler({}, ctx);
    expect(result).toEqual({ estado: "preparando" });
  });

  it("devolve dados com kpis e linhas", async () => {
    const now = new Date("2026-05-01T12:00:00Z");
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_produto_parado", ultimoBuildAt: now },
    ]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "estoque.saldo.hoje", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: null },
    ]);
    (ctx.prisma.fatoProdutoParado.findMany as jest.Mock).mockResolvedValue([
      { produtoNome: "X", localNome: "A", saldo: "3", dias: 95, vrSaldo: "200" },
    ]);
    const result = await estoqueProdutosParados.handler({}, ctx);
    expect(result).toMatchObject({ estado: "ok" });
    if (result.estado !== "preparando") {
      expect(result.dados.linhas).toHaveLength(1);
      expect(result.dados.kpis.totalParados).toBe(1);
      expect(result.dados).not.toHaveProperty("total");
    }
  });

  it("assertToolAllowed nega viewer sem domínio estoque", () => {
    const viewer: UserContext = { userId: "u2", role: "viewer", domains: [] } as UserContext;
    expect(() => assertToolAllowed(estoqueProdutosParados as never, viewer)).toThrow();
  });
});
