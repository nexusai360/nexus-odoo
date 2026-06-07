import { cadastrosServicoBuscar } from "./servico-buscar.js";
import { PAGINACAO_LIMIT_DEFAULT } from "../../lib/paginacao";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoServico: { findMany: jest.fn(), count: jest.fn() },
  };
}

function makeCtx(): ToolHandlerCtx {
  return {
    prisma: makePrisma() as never,
    user: { userId: "u1", role: "admin", domains: ["cadastros"] } as UserContext,
  };
}

function primeFreshness(ctx: ToolHandlerCtx) {
  const now = new Date("2026-06-01T12:00:00Z");
  (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
    { fato: "fato_servico", ultimoBuildAt: now },
  ]);
  (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
    { model: "sped.servico", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
  ]);
}

function fakeServicos(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    odooId: i + 1,
    codigo: `C${i + 1}`,
    codigoFormatado: null,
    descricao: `Servico ${i + 1}`,
    codigoTributacao: null,
    alInssRetido: { toNumber: () => 0 },
  }));
}

describe("servico_buscar , paginacao (alavanca 2b)", () => {
  it("aplica limit/offset no SQL (take/skip), desempate estavel e count com mesmo where", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoServico.findMany as jest.Mock).mockResolvedValue(fakeServicos(10));
    (ctx.prisma.fatoServico.count as jest.Mock).mockResolvedValue(100);

    const r = await cadastrosServicoBuscar.handler(
      { termo: "transporte", limit: 10, offset: 0 } as never,
      ctx,
    );

    const findCall = (ctx.prisma.fatoServico.findMany as jest.Mock).mock.calls[0][0];
    const countCall = (ctx.prisma.fatoServico.count as jest.Mock).mock.calls[0][0];
    expect(findCall.take).toBe(10);
    expect(findCall.skip).toBe(0);
    expect(findCall.orderBy).toEqual([{ codigo: "asc" }, { odooId: "asc" }]);
    // count usa o MESMO where da pagina.
    expect(countCall.where).toEqual(findCall.where);

    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.total).toBe(100);
      expect(r.dados._PAGINACAO.temMais).toBe(true);
      expect(r.dados._PAGINACAO.proximoOffset).toBe(10);
    }
  });

  it("ultima pagina nao tem proximoOffset", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoServico.count as jest.Mock).mockResolvedValue(15);
    (ctx.prisma.fatoServico.findMany as jest.Mock).mockResolvedValue(fakeServicos(5));

    const r = await cadastrosServicoBuscar.handler(
      { termo: "x", limit: 10, offset: 10 } as never,
      ctx,
    );
    const findCall = (ctx.prisma.fatoServico.findMany as jest.Mock).mock.calls[0][0];
    expect(findCall.skip).toBe(10);
    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.temMais).toBe(false);
      expect(r.dados._PAGINACAO.proximoOffset).toBeNull();
    }
  });

  it("default limit = 50 quando ausente", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoServico.count as jest.Mock).mockResolvedValue(3);
    (ctx.prisma.fatoServico.findMany as jest.Mock).mockResolvedValue(fakeServicos(3));

    await cadastrosServicoBuscar.handler({ termo: "x" } as never, ctx);
    const findCall = (ctx.prisma.fatoServico.findMany as jest.Mock).mock.calls[0][0];
    expect(findCall.take).toBe(PAGINACAO_LIMIT_DEFAULT);
  });
});
