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
    // Sem o fato de locais construido, o filtro por classificacao nao filtra (fail-safe):
    // o teste segue medindo o numero da arvore inteira, como antes.
    fatoEstoqueLocal: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
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

  it("conta saldoDemonstracao pela classificacao do fato, nao pelo nome curto", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoProduto.findFirst as jest.Mock).mockResolvedValue({ odooId: 102, nome: "Esteira" });
    // Dois locais: um de demonstracao com nome de CLIENTE (sem "demonstra" no nome curto)
    // e um deposito fisico. A regra antiga por substring somava 0 em demonstracao.
    (ctx.prisma.fatoEstoqueSaldo.findMany as jest.Mock).mockResolvedValue([
      { localId: 1, localNome: "Academia Cliente X", quantidade: 7 },
      { localId: 2, localNome: "Galpão Matriz", quantidade: 3 },
    ]);
    (ctx.prisma.fatoEstoqueSaldo.count as jest.Mock).mockResolvedValue(2);
    (ctx.prisma.fatoEstoqueSaldo.aggregate as jest.Mock).mockResolvedValue({ _sum: { quantidade: "10" } });
    (ctx.prisma.fatoEstoqueLocal.findMany as jest.Mock).mockResolvedValue([
      { odooId: 1, classificacao: "demonstracao", nomeCompleto: "Terceiros / Demonstração / Academia Cliente X" },
      { odooId: 2, classificacao: "fisico", nomeCompleto: "Próprio / Galpão Matriz" },
    ]);

    const r = await estoqueLocaisPorProduto.handler({ termo: "esteira", limit: 10, offset: 0 } as never, ctx);
    // classificou pela fonte unica: buscou os localIds da pagina no fato
    const calls = (ctx.prisma.fatoEstoqueLocal.findMany as jest.Mock).mock.calls;
    const metaCall = calls.find((c) => c[0]?.where?.odooId?.in)?.[0];
    expect(metaCall.where.odooId.in).toEqual([1, 2]);
    if (r.estado !== "preparando") {
      expect(r.dados._DESTAQUE!.saldoDemonstracao).toBe(7);
      expect(r.dados._DESTAQUE!.saldoProprio).toBe(3);
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
