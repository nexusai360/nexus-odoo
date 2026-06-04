import { cadastroParceirosSemDocumento } from "./parceiros-sem-documento.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoParceiro: { findMany: jest.fn(), count: jest.fn() },
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
    { fato: "fato_parceiro", ultimoBuildAt: now },
  ]);
  (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
    { model: "res.partner", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: null },
  ]);
}

function fakeLinhas(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    odooId: i + 1,
    nome: `P${i + 1}`,
    cidade: null,
    uf: null,
    ehCliente: true,
    ehFornecedor: false,
  }));
}

describe("cadastro_parceiros_sem_documento , paginacao (alavanca 2b)", () => {
  it("aplica limit/offset no SQL (take/skip) e desempate estavel no orderBy", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoParceiro.findMany as jest.Mock).mockResolvedValue(fakeLinhas(10));
    (ctx.prisma.fatoParceiro.count as jest.Mock).mockResolvedValue(100);

    const r = await cadastroParceirosSemDocumento.handler({ limit: 10, offset: 0 } as never, ctx);

    const callArgs = (ctx.prisma.fatoParceiro.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(10);
    expect(callArgs.skip).toBe(0);
    expect(callArgs.orderBy).toEqual([{ nome: "asc" }, { odooId: "asc" }]);

    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.total).toBe(100);
      expect(r.dados._PAGINACAO.temMais).toBe(true);
      expect(r.dados._PAGINACAO.proximoOffset).toBe(10);
    }
  });

  it("paginas nao se sobrepoem (offset avanca, sem mais paginas)", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoParceiro.count as jest.Mock).mockResolvedValue(15);
    (ctx.prisma.fatoParceiro.findMany as jest.Mock).mockResolvedValue(fakeLinhas(5));

    const r = await cadastroParceirosSemDocumento.handler({ limit: 10, offset: 10 } as never, ctx);
    const callArgs = (ctx.prisma.fatoParceiro.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.skip).toBe(10);
    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.temMais).toBe(false);
      expect(r.dados._PAGINACAO.proximoOffset).toBeNull();
    }
  });

  it("default limit = 10 quando ausente", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoParceiro.count as jest.Mock).mockResolvedValue(3);
    (ctx.prisma.fatoParceiro.findMany as jest.Mock).mockResolvedValue(fakeLinhas(3));

    await cadastroParceirosSemDocumento.handler({} as never, ctx);
    const callArgs = (ctx.prisma.fatoParceiro.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(10);
  });
});
