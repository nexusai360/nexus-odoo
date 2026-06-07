import { fiscalCartaCorrecao } from "./carta-correcao.js";
import { PAGINACAO_LIMIT_DEFAULT } from "../../lib/paginacao";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoCartaCorrecao: { findMany: jest.fn(), count: jest.fn() },
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
    { fato: "fato_carta_correcao", ultimoBuildAt: now },
  ]);
  (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
    { model: "sped.carta.correcao", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: now },
  ]);
}

function fakeLinhas(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    odooId: i + 1,
    descricao: `d${i + 1}`,
    correcao: `c${i + 1}`,
    documentoId: 100,
    dataAutorizacao: new Date("2026-05-20T00:00:00Z"),
    protocoloAutorizacao: `p${i + 1}`,
    sequencia: i + 1,
  }));
}

describe("fiscal_carta_correcao , paginacao (alavanca 2b)", () => {
  it("aplica limit/offset (take/skip) e desempate estavel no orderBy", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoCartaCorrecao.findMany as jest.Mock).mockResolvedValue(fakeLinhas(10));
    (ctx.prisma.fatoCartaCorrecao.count as jest.Mock).mockResolvedValue(100);

    const r = await fiscalCartaCorrecao.handler({ limit: 10, offset: 0 } as never, ctx);
    const callArgs = (ctx.prisma.fatoCartaCorrecao.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(10);
    expect(callArgs.skip).toBe(0);
    expect(callArgs.orderBy).toEqual([{ dataAutorizacao: "desc" }, { odooId: "asc" }]);
    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.total).toBe(100);
      expect(r.dados._PAGINACAO.temMais).toBe(true);
      expect(r.dados._PAGINACAO.proximoOffset).toBe(10);
    }
  });

  it("default limit = 50 quando ausente", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoCartaCorrecao.count as jest.Mock).mockResolvedValue(3);
    (ctx.prisma.fatoCartaCorrecao.findMany as jest.Mock).mockResolvedValue(fakeLinhas(3));

    await fiscalCartaCorrecao.handler({} as never, ctx);
    const callArgs = (ctx.prisma.fatoCartaCorrecao.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(PAGINACAO_LIMIT_DEFAULT);
  });
});
