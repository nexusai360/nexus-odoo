import { comercialPedidosSemVendedor } from "./pedidos-sem-vendedor.js";
import { PAGINACAO_LIMIT_DEFAULT } from "../../lib/paginacao";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoPedido: { findMany: jest.fn(), count: jest.fn(), aggregate: jest.fn() },
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
    dataOrcamento: new Date("2026-05-20T00:00:00Z"),
    vrNf: 200,
  }));
}

function primeQuery(ctx: ToolHandlerCtx, total: number, retornados: number) {
  (ctx.prisma.fatoPedido.findMany as jest.Mock).mockResolvedValue(fakeLinhas(retornados));
  (ctx.prisma.fatoPedido.count as jest.Mock).mockResolvedValue(total);
  (ctx.prisma.fatoPedido.aggregate as jest.Mock).mockResolvedValue({ _sum: { vrNf: total * 200 } });
}

describe("comercial_pedidos_sem_vendedor , paginacao (alavanca 2b)", () => {
  it("aplica limit/offset no SQL (take/skip) e desempate estavel no orderBy", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    primeQuery(ctx, 100, 10);

    const r = await comercialPedidosSemVendedor.handler({ limit: 10, offset: 0 } as never, ctx);

    const callArgs = (ctx.prisma.fatoPedido.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(10);
    expect(callArgs.skip).toBe(0);
    expect(callArgs.orderBy).toEqual([{ dataOrcamento: "desc" }, { odooId: "asc" }]);

    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.total).toBe(100);
      expect(r.dados._PAGINACAO.temMais).toBe(true);
      expect(r.dados._PAGINACAO.proximoOffset).toBe(10);
    }
  });

  it("ultima pagina nao indica mais itens", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    primeQuery(ctx, 15, 5);

    const r = await comercialPedidosSemVendedor.handler({ limit: 10, offset: 10 } as never, ctx);
    const callArgs = (ctx.prisma.fatoPedido.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.skip).toBe(10);
    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.temMais).toBe(false);
      expect(r.dados._PAGINACAO.proximoOffset).toBeNull();
    }
  });

  it("default limit = 50 quando ausente", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    primeQuery(ctx, 3, 3);

    await comercialPedidosSemVendedor.handler({} as never, ctx);
    const callArgs = (ctx.prisma.fatoPedido.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(PAGINACAO_LIMIT_DEFAULT);
  });
});
