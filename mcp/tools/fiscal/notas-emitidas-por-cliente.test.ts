import { fiscalNotasEmitidasPorCliente } from "./notas-emitidas-por-cliente.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoNotaFiscal: { findMany: jest.fn(), count: jest.fn(), aggregate: jest.fn() },
  };
}

function makeCtx(): ToolHandlerCtx {
  return {
    prisma: makePrisma() as never,
    user: { userId: "u1", role: "admin", domains: ["fiscal"] } as UserContext,
  };
}

function primeFreshness(ctx: ToolHandlerCtx) {
  const now = new Date("2026-06-01T12:00:00Z");
  (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
    { fato: "fato_nota_fiscal", ultimoBuildAt: now },
  ]);
  (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
    { model: "sped.documento", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: now },
  ]);
}

function fakeLinhas(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    numero: `${i + 1}`,
    serie: "1",
    dataEmissao: new Date("2026-05-20T00:00:00Z"),
    participanteNome: "Smartfit",
    situacaoNfe: "autorizada",
    vrNf: 10,
  }));
}

describe("fiscal_notas_emitidas_por_cliente , paginacao (alavanca 2b)", () => {
  it("aplica limit/offset (take/skip) e desempate estavel no orderBy", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoNotaFiscal.findMany as jest.Mock).mockResolvedValue(fakeLinhas(10));
    (ctx.prisma.fatoNotaFiscal.count as jest.Mock).mockResolvedValue(100);
    (ctx.prisma.fatoNotaFiscal.aggregate as jest.Mock).mockResolvedValue({ _sum: { vrNf: 1000 } });

    const r = await fiscalNotasEmitidasPorCliente.handler(
      { clienteTermo: "Smartfit", limit: 10, offset: 0 } as never,
      ctx,
    );
    const callArgs = (ctx.prisma.fatoNotaFiscal.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(10);
    expect(callArgs.skip).toBe(0);
    expect(callArgs.orderBy).toEqual([{ dataEmissao: "desc" }, { odooId: "asc" }]);
    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.total).toBe(100);
      expect(r.dados._PAGINACAO.temMais).toBe(true);
      expect(r.dados._PAGINACAO.proximoOffset).toBe(10);
    }
  });

  it("default limit = 10 quando ausente", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoNotaFiscal.count as jest.Mock).mockResolvedValue(3);
    (ctx.prisma.fatoNotaFiscal.findMany as jest.Mock).mockResolvedValue(fakeLinhas(3));
    (ctx.prisma.fatoNotaFiscal.aggregate as jest.Mock).mockResolvedValue({ _sum: { vrNf: 30 } });

    await fiscalNotasEmitidasPorCliente.handler({ clienteTermo: "Smartfit" } as never, ctx);
    const callArgs = (ctx.prisma.fatoNotaFiscal.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(10);
  });
});
