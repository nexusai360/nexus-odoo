import { fiscalReferenciaBuscar } from "./referencia-buscar.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoReferencia: { findMany: jest.fn(), count: jest.fn() },
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
    { fato: "fato_referencia", ultimoBuildAt: now },
  ]);
  (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
    { model: "sped.ncm", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: now },
  ]);
}

function fakeLinhas(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    tabela: "ncm",
    codigo: `${1000 + i}`,
    descricao: `desc ${i + 1}`,
  }));
}

describe("referencia_buscar , paginacao (alavanca 2b)", () => {
  it("aplica limit/offset (take/skip) e desempate estavel por id no orderBy", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoReferencia.findMany as jest.Mock).mockResolvedValue(fakeLinhas(10));
    (ctx.prisma.fatoReferencia.count as jest.Mock).mockResolvedValue(100);

    const r = await fiscalReferenciaBuscar.handler({ tabela: "ncm", limit: 10, offset: 0 } as never, ctx);
    const callArgs = (ctx.prisma.fatoReferencia.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(10);
    expect(callArgs.skip).toBe(0);
    expect(callArgs.orderBy).toEqual([{ codigo: "asc" }, { id: "asc" }]);
    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.total).toBe(100);
      expect(r.dados._PAGINACAO.temMais).toBe(true);
      expect(r.dados._PAGINACAO.proximoOffset).toBe(10);
    }
  });

  it("default limit = 10 quando ausente", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoReferencia.count as jest.Mock).mockResolvedValue(3);
    (ctx.prisma.fatoReferencia.findMany as jest.Mock).mockResolvedValue(fakeLinhas(3));

    await fiscalReferenciaBuscar.handler({ tabela: "ncm" } as never, ctx);
    const callArgs = (ctx.prisma.fatoReferencia.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(10);
  });
});
