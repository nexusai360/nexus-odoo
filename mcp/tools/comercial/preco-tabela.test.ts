import { comercialPrecoTabela } from "./preco-tabela.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoPreco: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
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
    { fato: "fato_preco", ultimoBuildAt: now },
  ]);
  (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
    { model: "sped.tabela.preco.regra", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
  ]);
}

const dec = (n: number) => ({ toNumber: () => n });

function fakeLinhas(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    odooId: i + 1,
    tabelaNome: "Tabela A",
    dimensao: "produto",
    produtoNome: `Produto ${i + 1}`,
    familiaNome: null,
    participanteNome: null,
    operacao: "fixo",
    precoBase: null,
    valor: dec(100),
    aliquota: null,
    quantidadeMinima: dec(1),
    dataInicial: null,
    dataFinal: null,
  }));
}

function primeQuery(ctx: ToolHandlerCtx, total: number, retornados: number) {
  (ctx.prisma.fatoPreco.findMany as jest.Mock).mockResolvedValue(fakeLinhas(retornados));
  (ctx.prisma.fatoPreco.count as jest.Mock).mockResolvedValue(total);
  (ctx.prisma.fatoPreco.findFirst as jest.Mock).mockResolvedValue({ tabelaNome: "Tabela A" });
}

describe("preco_tabela , paginacao (alavanca 2b)", () => {
  it("aplica limit/offset no SQL (take/skip) e desempate estavel no orderBy", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    primeQuery(ctx, 100, 10);

    const r = await comercialPrecoTabela.handler({ tabelaId: 7, limit: 10, offset: 0 } as never, ctx);

    const callArgs = (ctx.prisma.fatoPreco.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(10);
    expect(callArgs.skip).toBe(0);
    expect(callArgs.orderBy).toEqual([
      { produtoNome: "asc" },
      { familiaNome: "asc" },
      { odooId: "asc" },
    ]);

    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.total).toBe(100);
      expect(r.dados._PAGINACAO.temMais).toBe(true);
      expect(r.dados._PAGINACAO.proximoOffset).toBe(10);
    }
  });

  it("ultima pagina nao indica mais itens", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    primeQuery(ctx, 15, 5);

    const r = await comercialPrecoTabela.handler({ tabelaId: 7, limit: 10, offset: 10 } as never, ctx);
    const callArgs = (ctx.prisma.fatoPreco.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.skip).toBe(10);
    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.temMais).toBe(false);
      expect(r.dados._PAGINACAO.proximoOffset).toBeNull();
    }
  });

  it("default limit = 10 quando ausente", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    primeQuery(ctx, 3, 3);

    await comercialPrecoTabela.handler({ tabelaId: 7 } as never, ctx);
    const callArgs = (ctx.prisma.fatoPreco.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(10);
  });
});
