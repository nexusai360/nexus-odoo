import { comercialDetalharPedido } from "./detalhar-pedido.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoPedido: {
      findFirst: jest.fn(),
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
    { fato: "fato_pedido", ultimoBuildAt: now },
  ]);
  (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
    { model: "pedido.documento", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
  ]);
}

function fakePedido() {
  return {
    odooId: 42,
    numero: "P0042",
    tipo: "venda",
    etapaId: 3,
    etapaNome: "Aprovado",
    etapaFinaliza: false,
    operacaoId: null,
    operacaoNome: null,
    participanteId: 100,
    participanteNome: "Cliente ACME",
    vendedorId: 7,
    vendedorNome: "Maria Vendas",
    empresaId: 1,
    empresaNome: "Matrix Fitness",
    dataOrcamento: new Date("2026-05-10T00:00:00Z"),
    dataAprovacao: new Date("2026-05-15T00:00:00Z"),
    dataValidade: null,
    dataPrevista: null,
    vrProdutos: { toString: () => "1500.50" },
    vrNf: { toString: () => "1600.00" },
    atualizadoEm: new Date("2026-06-01T00:00:00Z"),
  };
}

describe("comercial_detalhar_pedido", () => {
  it("odooId existente => encontrado:true com campos confirmados", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoPedido.findFirst as jest.Mock).mockResolvedValue(fakePedido());

    const r = await comercialDetalharPedido.handler({ odooId: 42 } as never, ctx);

    const callArgs = (ctx.prisma.fatoPedido.findFirst as jest.Mock).mock.calls[0][0];
    expect(callArgs.where.odooId).toBe(42);

    expect(r.estado).not.toBe("preparando");
    if (r.estado !== "preparando") {
      expect(r.estado).toBe("ok");
      const p = r.dados.pedido!;
      expect(r.dados.encontrado).toBe(true);
      expect(p.odooId).toBe(42);
      expect(p.numero).toBe("P0042");
      expect(p.tipo).toBe("venda");
      expect(p.etapaNome).toBe("Aprovado");
      expect(p.etapaFinaliza).toBe(false);
      expect(p.participanteNome).toBe("Cliente ACME");
      expect(p.vendedorNome).toBe("Maria Vendas");
      expect(p.empresaNome).toBe("Matrix Fitness");
      expect(p.dataOrcamento).toBe("2026-05-10T00:00:00.000Z");
      expect(p.dataAprovacao).toBe("2026-05-15T00:00:00.000Z");
      expect(p.vrProdutos).toBe(1500.5);
      expect(p.vrNf).toBe(1600);
    }
  });

  it("odooId inexistente => encontrado:false SEM throw", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoPedido.findFirst as jest.Mock).mockResolvedValue(null);

    const r = await comercialDetalharPedido.handler({ odooId: 999 } as never, ctx);

    expect(r.estado).not.toBe("preparando");
    if (r.estado !== "preparando") {
      expect(r.dados.encontrado).toBe(false);
      expect(r.dados.pedido).toBeNull();
    }
  });

  it("retorno valida contra o outputSchema (parse)", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoPedido.findFirst as jest.Mock).mockResolvedValue(fakePedido());

    const r = await comercialDetalharPedido.handler({ odooId: 42 } as never, ctx);
    expect(() => comercialDetalharPedido.outputSchema.parse(r)).not.toThrow();
  });

  it("retorna estado preparando quando freshness nao primada", async () => {
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([]);
    (ctx.prisma.fatoPedido.findFirst as jest.Mock).mockResolvedValue(fakePedido());

    const r = await comercialDetalharPedido.handler({ odooId: 42 } as never, ctx);
    expect(r.estado).toBe("preparando");
  });
});
