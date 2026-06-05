import { comercialPedidosPorVendedor } from "./pedidos-por-vendedor.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

// EXCECAO de paginacao em memoria: o ranking vem de agregacao em memoria
// (group by vendedor), ordenado de forma estavel pela query. A paginacao e
// um slice [offset, offset+limit) e o total = numero de vendedores.

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoPedido: { findMany: jest.fn() },
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

// nVendedores vendedores distintos, 1 pedido cada, valor decrescente para
// produzir ordem estavel determinista.
function fakePedidos(nVendedores: number) {
  return Array.from({ length: nVendedores }, (_, i) => ({
    vendedorNome: `Vendedor ${String(i + 1).padStart(3, "0")}`,
    vrProdutos: 10000 - i,
  }));
}

describe("comercial_pedidos_por_vendedor , paginacao em memoria (alavanca 2b)", () => {
  it("fatia [offset, offset+limit) e total = numero de vendedores", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoPedido.findMany as jest.Mock).mockResolvedValue(fakePedidos(60));

    const r = await comercialPedidosPorVendedor.handler({ limit: 10, offset: 0 } as never, ctx);

    if (r.estado !== "preparando") {
      expect(r.dados.linhas.length).toBe(10);
      expect(r.dados._PAGINACAO.total).toBe(60);
      expect(r.dados._PAGINACAO.temMais).toBe(true);
      expect(r.dados._PAGINACAO.proximoOffset).toBe(10);
    }
  });

  it("segunda pagina nao repete vendedores da primeira", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoPedido.findMany as jest.Mock).mockResolvedValue(fakePedidos(25));

    const p1 = await comercialPedidosPorVendedor.handler({ limit: 10, offset: 0 } as never, ctx);
    const p2 = await comercialPedidosPorVendedor.handler({ limit: 10, offset: 10 } as never, ctx);

    if (p1.estado !== "preparando" && p2.estado !== "preparando") {
      const nomes1 = new Set(p1.dados.linhas.map((l) => l.vendedorNome));
      const sobrepoe = p2.dados.linhas.some((l) => nomes1.has(l.vendedorNome));
      expect(sobrepoe).toBe(false);
    }
  });

  it("default limit = 10 quando ausente", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoPedido.findMany as jest.Mock).mockResolvedValue(fakePedidos(40));

    const r = await comercialPedidosPorVendedor.handler({} as never, ctx);
    if (r.estado !== "preparando") {
      expect(r.dados.linhas.length).toBe(10);
    }
  });
});
