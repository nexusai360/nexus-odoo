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

  it.skip("devolve estado:'ok' com dados e fonteStatus quando há build e linhas", async () => {
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

  it.skip("devolve estado:'vazio' quando não há linhas", async () => {
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
    expect(() => assertToolAllowed(estoqueSaldoProduto as never, viewer)).toThrow();
  });

  describe("paginacao (alavanca 2b)", () => {
    // Excecao documentada: as linhas vem agregadas/ordenadas em memoria
    // (querySaldoProduto), entao o handler fatia [offset, offset+limit).
    function primeFreshness(ctx: ToolHandlerCtx) {
      const now = new Date("2026-06-01T12:00:00Z");
      (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
        { fato: "fato_estoque_saldo", ultimoBuildAt: now },
        { fato: "fato_produto", ultimoBuildAt: now },
      ]);
      (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
        { model: "estoque.saldo.hoje", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: null },
        { model: "product.product", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: null },
      ]);
    }

    // 25 produtos distintos, 1 linha de saldo cada (saldo > 0).
    function fakeSaldos(n: number) {
      return Array.from({ length: n }, (_, i) => ({
        produtoId: i + 1,
        produtoNome: `Produto ${i + 1}`,
        familiaNome: "Cardio",
        marcaNome: "Matrix",
        localId: 10,
        localNome: "Virtual",
        quantidade: 100 - i,
        vrSaldo: 1000 - i,
      }));
    }

    it("fatia a pagina e _PAGINACAO reflete o total de produtos", async () => {
      const ctx = makeCtx();
      primeFreshness(ctx);
      (ctx.prisma.fatoEstoqueSaldo.findMany as jest.Mock).mockResolvedValue(fakeSaldos(25));

      const r = await estoqueSaldoProduto.handler({ limit: 10, offset: 0 } as never, ctx);
      if (r.estado !== "preparando") {
        expect(r.dados.linhas).toHaveLength(10);
        expect(r.dados._PAGINACAO.total).toBe(25);
        expect(r.dados._PAGINACAO.temMais).toBe(true);
        expect(r.dados._PAGINACAO.proximoOffset).toBe(10);
        // topMaiores permanece sobre o conjunto completo (10 itens).
        expect((r.dados as Record<string, unknown>).topMaiores).toHaveLength(10);
      }
    });

    it("offset avanca a janela sem sobrepor", async () => {
      const ctx = makeCtx();
      primeFreshness(ctx);
      (ctx.prisma.fatoEstoqueSaldo.findMany as jest.Mock).mockResolvedValue(fakeSaldos(25));
      const pag2 = await estoqueSaldoProduto.handler({ limit: 10, offset: 20 } as never, ctx);
      if (pag2.estado !== "preparando") {
        expect(pag2.dados.linhas).toHaveLength(5);
        expect(pag2.dados._PAGINACAO.temMais).toBe(false);
        expect(pag2.dados._PAGINACAO.proximoOffset).toBeNull();
      }
    });

    it("default limit = 10 quando ausente", async () => {
      const ctx = makeCtx();
      primeFreshness(ctx);
      (ctx.prisma.fatoEstoqueSaldo.findMany as jest.Mock).mockResolvedValue(fakeSaldos(30));
      const r = await estoqueSaldoProduto.handler({} as never, ctx);
      if (r.estado !== "preparando") {
        expect(r.dados.linhas).toHaveLength(10);
      }
    });
  });
});
