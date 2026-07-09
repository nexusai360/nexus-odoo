import { comercialPedidoTravadosPorEtapa } from "./pedido-travados-por-etapa.js";
import { PAGINACAO_LIMIT_DEFAULT } from "../../lib/paginacao";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

// EXCECAO de paginacao em memoria: a lista nasce de agregacao em memoria
// (ultimo evento por pedido), entao a paginacao e por slice [offset, offset+limit)
// sobre o conjunto ordenado de forma estavel. O total e o conjunto inteiro.

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoPedidoHistorico: { findMany: jest.fn() },
    // Todos os pedidos das fixtures contam como VENDA (a query filtra por
    // categoria_operacao='venda' via fatoPedido.findMany).
    fatoPedido: {
      findMany: jest.fn().mockResolvedValue(
        Array.from({ length: 1000 }, (_, i) => ({ odooId: i + 1 })),
      ),
    },
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
    { fato: "fato_pedido_historico", ultimoBuildAt: now },
  ]);
  (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
    { model: "pedido.documento.historico", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
  ]);
}

// n pedidos, cada um com 1 evento parado ha ~200 dias (acima do diasMin default 30).
function fakeEventos(n: number) {
  const antiga = new Date("2025-10-01T00:00:00Z");
  return Array.from({ length: n }, (_, i) => ({
    pedidoId: i + 1,
    etapaNome: "Aguardando",
    dataEntrada: antiga,
  }));
}

describe("comercial_pedido_travados_por_etapa , paginacao em memoria (alavanca 2b)", () => {
  it("fatia [offset, offset+limit) e expoe total do conjunto", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoPedidoHistorico.findMany as jest.Mock).mockResolvedValue(fakeEventos(100));

    const r = await comercialPedidoTravadosPorEtapa.handler({ limit: 10, offset: 0 } as never, ctx);

    if (r.estado !== "preparando") {
      expect(r.dados.linhas.length).toBe(10);
      expect(r.dados.totalTravados).toBe(100);
      expect(r.dados._PAGINACAO.total).toBe(100);
      expect(r.dados._PAGINACAO.temMais).toBe(true);
      expect(r.dados._PAGINACAO.proximoOffset).toBe(10);
    }
  });

  it("segunda pagina nao repete itens da primeira", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoPedidoHistorico.findMany as jest.Mock).mockResolvedValue(fakeEventos(25));

    const p1 = await comercialPedidoTravadosPorEtapa.handler({ limit: 10, offset: 0 } as never, ctx);
    const p2 = await comercialPedidoTravadosPorEtapa.handler({ limit: 10, offset: 10 } as never, ctx);

    if (p1.estado !== "preparando" && p2.estado !== "preparando") {
      const ids1 = new Set(p1.dados.linhas.map((l) => l.pedidoId));
      const sobrepoe = p2.dados.linhas.some((l) => ids1.has(l.pedidoId));
      expect(sobrepoe).toBe(false);
    }
  });

  it("default limit = 50 quando ausente", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoPedidoHistorico.findMany as jest.Mock).mockResolvedValue(fakeEventos(60));

    const r = await comercialPedidoTravadosPorEtapa.handler({} as never, ctx);
    if (r.estado !== "preparando") {
      expect(r.dados.linhas.length).toBe(PAGINACAO_LIMIT_DEFAULT);
    }
  });
});
