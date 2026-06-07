import { comercialProdutosPorMargem } from "./produtos-por-margem.js";
import { PAGINACAO_LIMIT_DEFAULT } from "../../lib/paginacao";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    $queryRawUnsafe: jest.fn(),
    $queryRaw: jest.fn(),
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
    { fato: "fato_produto", ultimoBuildAt: now },
  ]);
  // fato_produto nao esta em FATO_FONTE; syncState vazio (status ok, ultimaSync null).
  (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([]);
}

function fakeRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    odoo_id: i + 1,
    nome: `Produto ${i + 1}`,
    preco_custo: 100,
    preco_venda: 200,
    margem_pct: 100 - i,
  }));
}

// $queryRawUnsafe: 1a chamada = lista; 2a chamada = total filtrado.
// $queryRaw (tagged): cntCom e depois cntSem.
function primeQueries(ctx: ToolHandlerCtx, retornados: number, totalFiltrado: number) {
  (ctx.prisma.$queryRawUnsafe as jest.Mock)
    .mockResolvedValueOnce(fakeRows(retornados))
    .mockResolvedValueOnce([{ n: BigInt(totalFiltrado) }]);
  (ctx.prisma.$queryRaw as jest.Mock)
    .mockResolvedValueOnce([{ n: BigInt(totalFiltrado) }]) // cntCom
    .mockResolvedValueOnce([{ n: BigInt(5) }]); // cntSem
}

describe("comercial_produtos_por_margem , paginacao (alavanca 2b)", () => {
  it("aplica LIMIT/OFFSET no SQL e ORDER BY com desempate por odoo_id", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    primeQueries(ctx, 10, 100);

    const r = await comercialProdutosPorMargem.handler({ limit: 10, offset: 0 } as never, ctx);

    const sql = (ctx.prisma.$queryRawUnsafe as jest.Mock).mock.calls[0][0] as string;
    expect(sql).toMatch(/LIMIT 10 OFFSET 0/);
    expect(sql).toMatch(/ORDER BY margem_pct DESC, odoo_id ASC/);

    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.total).toBe(100);
      expect(r.dados._PAGINACAO.temMais).toBe(true);
      expect(r.dados._PAGINACAO.proximoOffset).toBe(10);
    }
  });

  it("segunda pagina usa OFFSET e sinaliza fim quando esgota", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    primeQueries(ctx, 5, 15);

    const r = await comercialProdutosPorMargem.handler({ limit: 10, offset: 10 } as never, ctx);
    const sql = (ctx.prisma.$queryRawUnsafe as jest.Mock).mock.calls[0][0] as string;
    expect(sql).toMatch(/LIMIT 10 OFFSET 10/);
    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.temMais).toBe(false);
      expect(r.dados._PAGINACAO.proximoOffset).toBeNull();
    }
  });

  it("default limit = 50 quando ausente", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    primeQueries(ctx, 3, 3);

    await comercialProdutosPorMargem.handler({} as never, ctx);
    const sql = (ctx.prisma.$queryRawUnsafe as jest.Mock).mock.calls[0][0] as string;
    expect(sql).toMatch(new RegExp(`LIMIT ${PAGINACAO_LIMIT_DEFAULT} OFFSET 0`));
  });
});
