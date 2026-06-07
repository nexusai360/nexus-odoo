import { fiscalDfeImportadosPeriodo } from "./dfe-importados-periodo.js";
import { PAGINACAO_LIMIT_DEFAULT } from "../../lib/paginacao";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoDfe: { findMany: jest.fn(), count: jest.fn(), aggregate: jest.fn() },
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
    { fato: "fato_dfe", ultimoBuildAt: now },
  ]);
  (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
    { model: "sped.consulta.dfe.item", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: now },
  ]);
}

function fakeLinhas(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    chave: `c${i + 1}`,
    numero: `${i + 1}`,
    modelo: "55",
    cnpjFornecedor: "11111111000111",
    fornecedorNome: `F${i + 1}`,
    vrNf: 10,
    dataEmissao: new Date("2026-05-20T00:00:00Z"),
    manifestacao: "ciente",
  }));
}

describe("fiscal_dfe_importados_periodo , paginacao (alavanca 2b)", () => {
  it("aplica limit/offset no SQL (take/skip) e desempate estavel no orderBy", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoDfe.findMany as jest.Mock).mockResolvedValue(fakeLinhas(10));
    (ctx.prisma.fatoDfe.count as jest.Mock).mockResolvedValue(100);
    (ctx.prisma.fatoDfe.aggregate as jest.Mock).mockResolvedValue({ _sum: { vrNf: 1000 } });

    const r = await fiscalDfeImportadosPeriodo.handler({ limit: 10, offset: 0 } as never, ctx);

    const callArgs = (ctx.prisma.fatoDfe.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(10);
    expect(callArgs.skip).toBe(0);
    expect(callArgs.orderBy).toEqual([{ dataEmissao: "desc" }, { odooId: "asc" }]);

    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.total).toBe(100);
      expect(r.dados._PAGINACAO.temMais).toBe(true);
      expect(r.dados._PAGINACAO.proximoOffset).toBe(10);
    }
  });

  it("ultima pagina: temMais=false e proximoOffset=null", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoDfe.count as jest.Mock).mockResolvedValue(15);
    (ctx.prisma.fatoDfe.findMany as jest.Mock).mockResolvedValue(fakeLinhas(5));
    (ctx.prisma.fatoDfe.aggregate as jest.Mock).mockResolvedValue({ _sum: { vrNf: 50 } });

    const r = await fiscalDfeImportadosPeriodo.handler({ limit: 10, offset: 10 } as never, ctx);
    const callArgs = (ctx.prisma.fatoDfe.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.skip).toBe(10);
    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.temMais).toBe(false);
      expect(r.dados._PAGINACAO.proximoOffset).toBeNull();
    }
  });

  it("default limit = 50 quando ausente", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoDfe.count as jest.Mock).mockResolvedValue(3);
    (ctx.prisma.fatoDfe.findMany as jest.Mock).mockResolvedValue(fakeLinhas(3));
    (ctx.prisma.fatoDfe.aggregate as jest.Mock).mockResolvedValue({ _sum: { vrNf: 30 } });

    await fiscalDfeImportadosPeriodo.handler({} as never, ctx);
    const callArgs = (ctx.prisma.fatoDfe.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(PAGINACAO_LIMIT_DEFAULT);
  });
});
