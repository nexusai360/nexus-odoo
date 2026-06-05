// mcp/tools/estoque/produtos-parados.test.ts
import { estoqueProdutosParados } from "./produtos-parados.js";
import { assertToolAllowed } from "../../catalog/registry.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoProdutoParado: {
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
  };
}

function makeCtx(role = "admin", domains: string[] = ["estoque"]): ToolHandlerCtx {
  return {
    prisma: makePrisma() as never,
    user: { userId: "u1", role, domains } as UserContext,
  };
}

function primeFreshness(ctx: ToolHandlerCtx) {
  const now = new Date("2026-05-01T12:00:00Z");
  (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
    { fato: "fato_produto_parado", ultimoBuildAt: now },
  ]);
  (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
    { model: "estoque.saldo.hoje", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: null },
  ]);
}

function fakeLinhas(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    produtoNome: `X${i + 1}`,
    localNome: "A",
    saldo: "3",
    dias: 95 - i,
    vrSaldo: "200",
    saldoHojeId: i + 1,
  }));
}

describe("estoque_produtos_parados", () => {
  it("devolve estado:'preparando' quando FatoBuildState ausente", async () => {
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([]);
    const result = await estoqueProdutosParados.handler({}, ctx);
    expect(result).toEqual({ estado: "preparando" });
  });

  it("devolve dados com kpis e linhas (count/aggregate sobre o conjunto)", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoProdutoParado.findMany as jest.Mock).mockResolvedValue(fakeLinhas(1));
    (ctx.prisma.fatoProdutoParado.count as jest.Mock).mockResolvedValue(1);
    (ctx.prisma.fatoProdutoParado.aggregate as jest.Mock).mockResolvedValue({
      _sum: { vrSaldo: "200" },
    });
    const result = await estoqueProdutosParados.handler({}, ctx);
    expect(result).toMatchObject({ estado: "ok" });
    if (result.estado !== "preparando") {
      expect(result.dados.linhas).toHaveLength(1);
      expect(result.dados.kpis.totalParados).toBe(1);
      expect(result.dados.kpis.valorImobilizado).toBe(200);
    }
  });

  it("aplica limit/offset no SQL (take/skip) e desempate estavel no orderBy", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoProdutoParado.findMany as jest.Mock).mockResolvedValue(fakeLinhas(10));
    (ctx.prisma.fatoProdutoParado.count as jest.Mock).mockResolvedValue(100);
    (ctx.prisma.fatoProdutoParado.aggregate as jest.Mock).mockResolvedValue({
      _sum: { vrSaldo: "5000" },
    });

    const result = await estoqueProdutosParados.handler({ limit: 10, offset: 0 } as never, ctx);

    const callArgs = (ctx.prisma.fatoProdutoParado.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(10);
    expect(callArgs.skip).toBe(0);
    expect(callArgs.orderBy).toEqual([{ dias: "desc" }, { saldoHojeId: "asc" }]);

    if (result.estado !== "preparando") {
      expect(result.dados._PAGINACAO.total).toBe(100);
      expect(result.dados._PAGINACAO.temMais).toBe(true);
      expect(result.dados._PAGINACAO.proximoOffset).toBe(10);
    }
  });

  it("paginas nao se sobrepoem (offset avanca, sem mais paginas no fim)", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoProdutoParado.findMany as jest.Mock).mockResolvedValue(fakeLinhas(5));
    (ctx.prisma.fatoProdutoParado.count as jest.Mock).mockResolvedValue(15);
    (ctx.prisma.fatoProdutoParado.aggregate as jest.Mock).mockResolvedValue({
      _sum: { vrSaldo: "300" },
    });

    const result = await estoqueProdutosParados.handler({ limit: 10, offset: 10 } as never, ctx);
    const callArgs = (ctx.prisma.fatoProdutoParado.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.skip).toBe(10);
    if (result.estado !== "preparando") {
      expect(result.dados._PAGINACAO.temMais).toBe(false);
      expect(result.dados._PAGINACAO.proximoOffset).toBeNull();
    }
  });

  it("default limit = 10 quando ausente", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoProdutoParado.findMany as jest.Mock).mockResolvedValue(fakeLinhas(3));
    (ctx.prisma.fatoProdutoParado.count as jest.Mock).mockResolvedValue(3);
    (ctx.prisma.fatoProdutoParado.aggregate as jest.Mock).mockResolvedValue({
      _sum: { vrSaldo: "600" },
    });

    await estoqueProdutosParados.handler({} as never, ctx);
    const callArgs = (ctx.prisma.fatoProdutoParado.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(10);
  });

  it("assertToolAllowed nega viewer sem domínio estoque", () => {
    const viewer: UserContext = { userId: "u2", role: "viewer", domains: [] } as UserContext;
    expect(() => assertToolAllowed(estoqueProdutosParados as never, viewer)).toThrow();
  });
});
