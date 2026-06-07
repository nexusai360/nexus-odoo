import { fiscalReinfEventos } from "./reinf-eventos.js";
import { PAGINACAO_LIMIT_DEFAULT } from "../../lib/paginacao";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoReinfEvento: { findMany: jest.fn(), count: jest.fn() },
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
    { fato: "fato_reinf_evento", ultimoBuildAt: now },
  ]);
  (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
    { model: "reinf.evento", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: now },
  ]);
}

function fakeLinhas(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    odooId: i + 1,
    chave: `c${i + 1}`,
    tipo: "R-4020",
    situacao: "enviado",
    protocoloTransmissao: `p${i + 1}`,
    empresaCnpjRaiz: "11111111",
    dataEvento: new Date("2026-05-20T00:00:00Z"),
  }));
}

describe("fiscal_reinf_eventos , paginacao (alavanca 2b)", () => {
  it("aplica limit/offset (take/skip) e desempate estavel no orderBy", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoReinfEvento.findMany as jest.Mock).mockResolvedValue(fakeLinhas(10));
    (ctx.prisma.fatoReinfEvento.count as jest.Mock).mockResolvedValue(100);

    const r = await fiscalReinfEventos.handler({ limit: 10, offset: 0 } as never, ctx);
    const callArgs = (ctx.prisma.fatoReinfEvento.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(10);
    expect(callArgs.skip).toBe(0);
    expect(callArgs.orderBy).toEqual([{ dataEvento: "desc" }, { odooId: "asc" }]);
    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.total).toBe(100);
      expect(r.dados._PAGINACAO.temMais).toBe(true);
      expect(r.dados._PAGINACAO.proximoOffset).toBe(10);
    }
  });

  it("default limit = 50 quando ausente", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoReinfEvento.count as jest.Mock).mockResolvedValue(3);
    (ctx.prisma.fatoReinfEvento.findMany as jest.Mock).mockResolvedValue(fakeLinhas(3));

    await fiscalReinfEventos.handler({} as never, ctx);
    const callArgs = (ctx.prisma.fatoReinfEvento.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(PAGINACAO_LIMIT_DEFAULT);
  });
});
