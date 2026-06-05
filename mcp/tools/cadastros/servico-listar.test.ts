import { cadastrosServicoListar } from "./servico-listar.js";
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

describe("servico_listar , paginacao (alavanca 2b)", () => {
  it("aplica limit/offset no SQL (take/skip) e desempate estavel no orderBy", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoServico.findMany as jest.Mock).mockResolvedValue(fakeServicos(10));
    (ctx.prisma.fatoServico.count as jest.Mock).mockResolvedValue(100);

    const r = await cadastrosServicoListar.handler({ limit: 10, offset: 0 } as never, ctx);

    const callArgs = (ctx.prisma.fatoServico.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(10);
    expect(callArgs.skip).toBe(0);
    expect(callArgs.orderBy).toEqual([{ codigo: "asc" }, { odooId: "asc" }]);

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

    const r = await cadastrosServicoListar.handler({ limit: 10, offset: 10 } as never, ctx);
    const callArgs = (ctx.prisma.fatoServico.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.skip).toBe(10);
    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.temMais).toBe(false);
      expect(r.dados._PAGINACAO.proximoOffset).toBeNull();
    }
  });

  it("default limit = 10 quando ausente", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoServico.count as jest.Mock).mockResolvedValue(3);
    (ctx.prisma.fatoServico.findMany as jest.Mock).mockResolvedValue(fakeServicos(3));

    await cadastrosServicoListar.handler({} as never, ctx);
    const callArgs = (ctx.prisma.fatoServico.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(10);
  });
});
