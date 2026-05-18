// mcp/tools/estoque/saldo-produto.test.ts
import { estoqueSaldoProduto } from "./saldo-produto.js";
import { assertToolAllowed } from "../../catalog/registry.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoEstoqueSaldo: { findMany: jest.fn() },
    ...overrides,
  };
}

function makeCtx(role = "admin", domains: string[] = ["estoque"]): ToolHandlerCtx {
  return {
    prisma: makePrisma() as never,
    user: { userId: "u1", role, domains } as UserContext,
  };
}

describe("estoque_saldo_produto", () => {
  it("devolve envelope estado:'preparando' quando FatoBuildState ausente", async () => {
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([]);
    const result = await estoqueSaldoProduto.handler({}, ctx);
    expect(result).toEqual({ estado: "preparando" });
  });

  it("devolve estado:'ok' com dados e fonteStatus quando há build e linhas", async () => {
    const now = new Date("2026-05-01T12:00:00Z");
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_estoque_saldo", ultimoBuildAt: now },
    ]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "estoque.saldo.hoje", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: null },
    ]);
    (ctx.prisma.fatoEstoqueSaldo.findMany as jest.Mock).mockResolvedValue([
      {
        produtoId: 1,
        produtoNome: "Esteira",
        familiaNome: "Cardio",
        marcaNome: "Matrix",
        localId: 10,
        localNome: "Virtual",
        quantidade: 5,
        vrSaldo: 1000,
      },
    ]);
    const result = await estoqueSaldoProduto.handler({}, ctx);
    expect(result).toMatchObject({
      estado: "ok",
      atualizadoEm: now.toISOString(),
      fonteStatus: { status: "ok" },
    });
    if (result.estado !== "preparando") {
      expect(result.dados.linhas).toHaveLength(1);
      expect(result.dados.linhas[0]).toMatchObject({
        produtoNome: "Esteira",
        familiaNome: "Cardio",
      });
      expect(result.dados.linhas[0]).not.toHaveProperty("detalhePorLocal");
    }
  });

  it("devolve estado:'vazio' quando não há linhas", async () => {
    const now = new Date("2026-05-01T12:00:00Z");
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_estoque_saldo", ultimoBuildAt: now },
    ]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "estoque.saldo.hoje", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: null },
    ]);
    (ctx.prisma.fatoEstoqueSaldo.findMany as jest.Mock).mockResolvedValue([]);
    const result = await estoqueSaldoProduto.handler({}, ctx);
    expect(result).toMatchObject({ estado: "vazio" });
  });

  it("assertToolAllowed nega viewer sem domínio estoque", () => {
    const viewer: UserContext = { userId: "u2", role: "viewer", domains: [] } as UserContext;
    expect(() => assertToolAllowed(estoqueSaldoProduto, viewer)).toThrow();
  });
});
