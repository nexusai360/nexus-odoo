import { cadastroParceirosNovos, resolverPeriodoParceirosNovos } from "./parceiros-novos.js";
import { PAGINACAO_LIMIT_DEFAULT } from "../../lib/paginacao";
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
    documento: null,
    cidade: null,
    uf: null,
    ehCliente: true,
    ehFornecedor: false,
    dataCriacao: new Date("2026-05-20T00:00:00Z"),
  }));
}

describe("cadastro_parceiros_novos , paginacao (alavanca 2b)", () => {
  it("aplica limit/offset no SQL (take/skip) e desempate estavel no orderBy", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoParceiro.findMany as jest.Mock).mockResolvedValue(fakeLinhas(10));
    (ctx.prisma.fatoParceiro.count as jest.Mock).mockResolvedValue(100);

    const r = await cadastroParceirosNovos.handler({ limit: 10, offset: 0 } as never, ctx);

    const callArgs = (ctx.prisma.fatoParceiro.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(10);
    expect(callArgs.skip).toBe(0);
    expect(callArgs.orderBy).toEqual([{ dataCriacao: "desc" }, { odooId: "asc" }]);

    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.total).toBe(100);
      expect(r.dados._PAGINACAO.temMais).toBe(true);
      expect(r.dados._PAGINACAO.proximoOffset).toBe(10);
    }
  });

  it("paginas nao se sobrepoem (offset avanca)", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoParceiro.count as jest.Mock).mockResolvedValue(15);
    (ctx.prisma.fatoParceiro.findMany as jest.Mock).mockResolvedValue(fakeLinhas(5));

    const r = await cadastroParceirosNovos.handler({ limit: 10, offset: 10 } as never, ctx);
    const callArgs = (ctx.prisma.fatoParceiro.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.skip).toBe(10);
    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.temMais).toBe(false);
      expect(r.dados._PAGINACAO.proximoOffset).toBeNull();
    }
  });

  it("default limit = 50 quando ausente", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoParceiro.count as jest.Mock).mockResolvedValue(3);
    (ctx.prisma.fatoParceiro.findMany as jest.Mock).mockResolvedValue(fakeLinhas(3));

    await cadastroParceirosNovos.handler({} as never, ctx);
    const callArgs = (ctx.prisma.fatoParceiro.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(PAGINACAO_LIMIT_DEFAULT);
  });
});

// Esta tool tinha um resolvedor de periodo PROPRIO, que nao importava nada de `corte-dados`.
// Era a unica do MCP que ignorava a data de inicio das analises: pedir periodoDe "2020-01-01"
// (ou o preset `ano_corrente`, que nasce em 1o de janeiro) varria o cadastro inteiro abaixo do
// corte e respondia como se aquele fosse o periodo coberto.
describe("cadastro_parceiros_novos , piso na data de inicio das analises", () => {
  const CORTE = "2026-03-16";
  const HOJE = new Date("2026-07-13T12:00:00Z");

  it("periodo explicito anterior ao corte e grampeado nele, e avisa", () => {
    const p = resolverPeriodoParceirosNovos(
      { periodoDe: "2020-01-01", periodoAte: "2026-07-13" },
      CORTE,
      HOJE,
    );
    expect(p.de.toISOString().slice(0, 10)).toBe(CORTE);
    expect(p.cortado).toBe(true);
    expect(p.aviso).toContain("16/03/2026");
  });

  it("periodo depois do corte passa intacto e nao avisa", () => {
    const p = resolverPeriodoParceirosNovos(
      { periodoDe: "2026-05-01", periodoAte: "2026-05-31" },
      CORTE,
      HOJE,
    );
    expect(p.de.toISOString().slice(0, 10)).toBe("2026-05-01");
    expect(p.cortado).toBe(false);
    expect(p.aviso).toBeUndefined();
  });

  it("preset `ano_corrente` (1o de janeiro) e puxado para o corte", () => {
    const p = resolverPeriodoParceirosNovos({ periodoNome: "ano_corrente" }, CORTE, HOJE);
    expect(p.de.toISOString().slice(0, 10)).toBe(CORTE);
    expect(p.cortado).toBe(true);
  });

  it("preset curto (dentro da janela) nao e afetado", () => {
    const p = resolverPeriodoParceirosNovos({ periodoNome: "ultimos_7_dias" }, CORTE, HOJE);
    expect(p.de.toISOString().slice(0, 10)).toBe("2026-07-07");
    expect(p.cortado).toBe(false);
  });

  it("segue a data configurada, sem data cravada no codigo", () => {
    const p = resolverPeriodoParceirosNovos(
      { periodoNome: "ano_corrente" },
      "2026-06-01", // o dono moveu a data de inicio das analises
      HOJE,
    );
    expect(p.de.toISOString().slice(0, 10)).toBe("2026-06-01");
    expect(p.cortado).toBe(true);
  });

  it("o where do Prisma nasce com o piso do corte", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoParceiro.count as jest.Mock).mockResolvedValue(0);
    (ctx.prisma.fatoParceiro.findMany as jest.Mock).mockResolvedValue([]);

    // periodoDe muito antigo: o where nao pode descer abaixo do corte vigente do processo.
    await cadastroParceirosNovos.handler(
      { periodoDe: "2020-01-01", periodoAte: "2026-07-13" } as never,
      ctx,
    );
    const where = (ctx.prisma.fatoParceiro.findMany as jest.Mock).mock.calls[0][0].where;
    const gte = (where.dataCriacao as { gte: Date }).gte;
    expect(gte.toISOString().slice(0, 10) >= "2026-01-01").toBe(true);
    expect(gte.toISOString().slice(0, 10)).not.toBe("2020-01-01");
  });
});
