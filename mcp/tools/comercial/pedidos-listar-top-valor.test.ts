import { comercialPedidosListarTopValor } from "./pedidos-listar-top-valor.js";
import { PAGINACAO_LIMIT_DEFAULT } from "../../lib/paginacao";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoPedido: { findMany: jest.fn(), count: jest.fn() },
  };
}

function makeCtx(): ToolHandlerCtx {
  return {
    prisma: makePrisma() as never,
    user: { userId: "u1", role: "admin", domains: ["comercial"] } as UserContext,
  };
}

function primeFreshness(ctx: ToolHandlerCtx) {
  const now = new Date("2026-06-01T12:00:00Z");
  (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
    { fato: "fato_pedido", ultimoBuildAt: now },
  ]);
  (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
    { model: "pedido.documento", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
  ]);
}

function fakeLinhas(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    odooId: i + 1,
    numero: `P${i + 1}`,
    participanteNome: `Cliente ${i + 1}`,
    etapaNome: "Em aberto",
    vendedorNome: "V1",
    dataOrcamento: new Date("2026-05-20T00:00:00Z"),
    vrProdutos: 1000 - i,
  }));
}

describe("comercial_pedidos_listar_top_valor , paginacao (alavanca 2b)", () => {
  it("aplica limit/offset no SQL (take/skip) e desempate estavel no orderBy", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoPedido.findMany as jest.Mock).mockResolvedValue(fakeLinhas(10));
    (ctx.prisma.fatoPedido.count as jest.Mock).mockResolvedValue(100);

    const r = await comercialPedidosListarTopValor.handler({ limit: 10, offset: 0 } as never, ctx);

    const callArgs = (ctx.prisma.fatoPedido.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(10);
    expect(callArgs.skip).toBe(0);
    expect(callArgs.orderBy).toEqual([{ vrProdutos: "desc" }, { odooId: "asc" }]);

    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.total).toBe(100);
      expect(r.dados._PAGINACAO.temMais).toBe(true);
      expect(r.dados._PAGINACAO.proximoOffset).toBe(10);
    }
  });

  it("ordenacao data_asc inclui desempate por odooId", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoPedido.findMany as jest.Mock).mockResolvedValue(fakeLinhas(5));
    (ctx.prisma.fatoPedido.count as jest.Mock).mockResolvedValue(5);

    await comercialPedidosListarTopValor.handler({ ordenacao: "data_asc" } as never, ctx);
    const callArgs = (ctx.prisma.fatoPedido.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.orderBy).toEqual([{ dataOrcamento: "asc" }, { odooId: "asc" }]);
  });

  it("default limit = 50 quando ausente", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoPedido.findMany as jest.Mock).mockResolvedValue(fakeLinhas(3));
    (ctx.prisma.fatoPedido.count as jest.Mock).mockResolvedValue(3);

    await comercialPedidosListarTopValor.handler({} as never, ctx);
    const callArgs = (ctx.prisma.fatoPedido.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(PAGINACAO_LIMIT_DEFAULT);
  });
});
