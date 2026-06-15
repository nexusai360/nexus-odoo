// mcp/tools/estoque/locais-por-produto.test.ts
import { estoqueLocaisPorProduto } from "./locais-por-produto.js";
import { PAGINACAO_LIMIT_DEFAULT } from "../../lib/paginacao";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoProduto: { findFirst: jest.fn() },
    fatoEstoqueSaldo: {
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
  };
}

function makeCtx(): ToolHandlerCtx {
  return {
    prisma: makePrisma() as never,
    user: { userId: "u1", role: "admin", domains: ["estoque"] } as UserContext,
  };
}

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

function fakeLocais(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    localId: i + 1,
    localNome: `Local ${i + 1}`,
    quantidade: 100 - i,
  }));
}

describe("estoque_locais_por_produto , paginacao (alavanca 2b)", () => {
  it("aplica limit/offset no SQL (take/skip) e desempate estavel no orderBy", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoProduto.findFirst as jest.Mock).mockResolvedValue({
      odooId: 102,
      nome: "Esteira",
    });
    (ctx.prisma.fatoEstoqueSaldo.findMany as jest.Mock).mockResolvedValue(fakeLocais(10));
    (ctx.prisma.fatoEstoqueSaldo.count as jest.Mock).mockResolvedValue(100);
    (ctx.prisma.fatoEstoqueSaldo.aggregate as jest.Mock).mockResolvedValue({
      _sum: { quantidade: "500" },
    });

    const r = await estoqueLocaisPorProduto.handler({ termo: "esteira", limit: 10, offset: 0 } as never, ctx);

    const callArgs = (ctx.prisma.fatoEstoqueSaldo.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(10);
    expect(callArgs.skip).toBe(0);
    expect(callArgs.orderBy).toEqual([{ quantidade: "desc" }, { localId: "asc" }]);
    expect(callArgs.where).toEqual({ produtoId: 102, localId: { not: null } });

    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.total).toBe(100);
      expect(r.dados._PAGINACAO.temMais).toBe(true);
      expect(r.dados._PAGINACAO.proximoOffset).toBe(10);
      expect(r.dados.saldoTotal).toBe(500);
      expect(r.dados.totalLocais).toBe(100);
    }
  });

  it("ultima pagina nao tem mais (offset avanca)", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoProduto.findFirst as jest.Mock).mockResolvedValue({
      odooId: 102,
      nome: "Esteira",
    });
    (ctx.prisma.fatoEstoqueSaldo.findMany as jest.Mock).mockResolvedValue(fakeLocais(5));
    (ctx.prisma.fatoEstoqueSaldo.count as jest.Mock).mockResolvedValue(15);
    (ctx.prisma.fatoEstoqueSaldo.aggregate as jest.Mock).mockResolvedValue({
      _sum: { quantidade: "75" },
    });

    const r = await estoqueLocaisPorProduto.handler({ termo: "esteira", limit: 10, offset: 10 } as never, ctx);
    const callArgs = (ctx.prisma.fatoEstoqueSaldo.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.skip).toBe(10);
    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.temMais).toBe(false);
      expect(r.dados._PAGINACAO.proximoOffset).toBeNull();
    }
  });

  it("default limit = 50 quando ausente", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoProduto.findFirst as jest.Mock).mockResolvedValue({
      odooId: 102,
      nome: "Esteira",
    });
    (ctx.prisma.fatoEstoqueSaldo.findMany as jest.Mock).mockResolvedValue(fakeLocais(3));
    (ctx.prisma.fatoEstoqueSaldo.count as jest.Mock).mockResolvedValue(3);
    (ctx.prisma.fatoEstoqueSaldo.aggregate as jest.Mock).mockResolvedValue({
      _sum: { quantidade: "30" },
    });

    await estoqueLocaisPorProduto.handler({ termo: "esteira" } as never, ctx);
    const callArgs = (ctx.prisma.fatoEstoqueSaldo.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(PAGINACAO_LIMIT_DEFAULT);
  });
});
