import { comercialParcelasAVencer } from "./parcelas-a-vencer.js";
import { PAGINACAO_LIMIT_DEFAULT } from "../../lib/paginacao";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoPedidoParcela: { findMany: jest.fn(), count: jest.fn(), aggregate: jest.fn() },
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
    { fato: "fato_pedido_parcela", ultimoBuildAt: now },
  ]);
  (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
    { model: "pedido.parcela", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
  ]);
}

function fakeLinhas(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    pedidoId: i + 1,
    participanteNome: `Cliente ${i + 1}`,
    numero: `P${i + 1}`,
    dataVencimento: new Date("2026-06-10T00:00:00Z"),
    valor: 100,
  }));
}

describe("comercial_parcelas_a_vencer , paginacao (alavanca 2b)", () => {
  it("aplica limit/offset no SQL (take/skip) e desempate estavel no orderBy", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoPedidoParcela.findMany as jest.Mock).mockResolvedValue(fakeLinhas(10));
    (ctx.prisma.fatoPedidoParcela.count as jest.Mock).mockResolvedValue(100);
    (ctx.prisma.fatoPedidoParcela.aggregate as jest.Mock).mockResolvedValue({ _sum: { valor: 9999 } });

    const r = await comercialParcelasAVencer.handler({ limit: 10, offset: 0 } as never, ctx);

    const callArgs = (ctx.prisma.fatoPedidoParcela.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(10);
    expect(callArgs.skip).toBe(0);
    expect(callArgs.orderBy).toEqual([{ dataVencimento: "asc" }, { odooId: "asc" }]);

    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.total).toBe(100);
      expect(r.dados._PAGINACAO.temMais).toBe(true);
      expect(r.dados._PAGINACAO.proximoOffset).toBe(10);
    }
  });

  it("paginas nao se sobrepoem (offset avanca, sem mais paginas)", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoPedidoParcela.count as jest.Mock).mockResolvedValue(15);
    (ctx.prisma.fatoPedidoParcela.findMany as jest.Mock).mockResolvedValue(fakeLinhas(5));
    (ctx.prisma.fatoPedidoParcela.aggregate as jest.Mock).mockResolvedValue({ _sum: { valor: 500 } });

    const r = await comercialParcelasAVencer.handler({ limit: 10, offset: 10 } as never, ctx);
    const callArgs = (ctx.prisma.fatoPedidoParcela.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.skip).toBe(10);
    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.temMais).toBe(false);
      expect(r.dados._PAGINACAO.proximoOffset).toBeNull();
    }
  });

  it("default limit = 50 quando ausente", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoPedidoParcela.count as jest.Mock).mockResolvedValue(3);
    (ctx.prisma.fatoPedidoParcela.findMany as jest.Mock).mockResolvedValue(fakeLinhas(3));
    (ctx.prisma.fatoPedidoParcela.aggregate as jest.Mock).mockResolvedValue({ _sum: { valor: 300 } });

    await comercialParcelasAVencer.handler({} as never, ctx);
    const callArgs = (ctx.prisma.fatoPedidoParcela.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(PAGINACAO_LIMIT_DEFAULT);
  });
});
