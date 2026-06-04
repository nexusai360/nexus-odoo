import { fiscalNotasEmitidasPorProduto } from "./notas-emitidas-por-produto.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    $queryRawUnsafe: jest.fn(),
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
    { fato: "fato_nota_fiscal_item", ultimoBuildAt: now },
    { fato: "fato_produto", ultimoBuildAt: now },
  ]);
  (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
    { model: "sped.documento", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: now },
    { model: "sped.documento.item", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: now },
    { model: "sped.produto", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: now },
  ]);
}

function fakeRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    numero: `${i + 1}`,
    data_emissao: new Date("2026-05-20T00:00:00Z"),
    participante_nome: `C${i + 1}`,
    quantidade: "2",
    valor: "100",
  }));
}

// Roteia a chamada SQL: a query paginada contem LIMIT/OFFSET; a de total contem
// COUNT(DISTINCT ...).
function primeSql(ctx: ToolHandlerCtx, rows: unknown[], total: number) {
  (ctx.prisma.$queryRawUnsafe as jest.Mock).mockImplementation((sql: string) => {
    if (sql.includes("COUNT(DISTINCT")) {
      return Promise.resolve([{ total: BigInt(total), qtotal: "200", vtotal: "10000" }]);
    }
    return Promise.resolve(rows);
  });
}

describe("fiscal_notas_emitidas_por_produto , paginacao (alavanca 2b)", () => {
  it("passa LIMIT/OFFSET como parametros e ORDER BY com desempate por odoo_id", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    primeSql(ctx, fakeRows(10), 100);

    const r = await fiscalNotasEmitidasPorProduto.handler(
      { produtoTermo: "esteira", limit: 10, offset: 0 } as never,
      ctx,
    );

    const pagCall = (ctx.prisma.$queryRawUnsafe as jest.Mock).mock.calls.find((c) =>
      String(c[0]).includes("LIMIT"),
    );
    expect(pagCall).toBeDefined();
    const sql = String(pagCall[0]);
    expect(sql).toContain("ORDER BY nf.data_emissao DESC, nf.odoo_id ASC");
    // params: $1 termo, $2 limit, $3 offset (sem periodo) => 10 e 0 no final.
    const params = pagCall.slice(1);
    expect(params[params.length - 2]).toBe(10);
    expect(params[params.length - 1]).toBe(0);

    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.total).toBe(100);
      expect(r.dados._PAGINACAO.temMais).toBe(true);
      expect(r.dados._PAGINACAO.proximoOffset).toBe(10);
    }
  });

  it("default limit = 10 quando ausente", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    primeSql(ctx, fakeRows(3), 3);

    await fiscalNotasEmitidasPorProduto.handler({ produtoTermo: "esteira" } as never, ctx);
    const pagCall = (ctx.prisma.$queryRawUnsafe as jest.Mock).mock.calls.find((c) =>
      String(c[0]).includes("LIMIT"),
    );
    const params = pagCall.slice(1);
    expect(params[params.length - 2]).toBe(10);
  });
});
