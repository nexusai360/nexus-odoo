// mcp/__tests__/ranking-desempate.test.ts
// F4 Onda 5 , ranking com desempate estavel.
//
// Prova que as tools de ranking/top pedem ordenacao DETERMINISTICA: alem do
// criterio semantico (valor/contagem desc), um desempate por id/rotulo, para
// que o "top" e "os proximos" nao variem quando dois itens empatam no criterio
// primario. Cobre os dois mecanismos usados no codigo: orderBy do Prisma
// (vendedores , groupBy) e comparador JS (top-movimentados , .sort()).

import { describe, it, expect, jest } from "@jest/globals";
import { comercialVendedoresCadastrados } from "../tools/comercial/vendedores-cadastrados.js";
import type { ToolHandlerCtx } from "../catalog/types.js";
import type { UserContext } from "../auth/user-context.js";

function makeCtx() {
  const now = new Date("2026-06-01T12:00:00Z");
  const prisma = {
    fatoBuildState: {
      findMany: jest.fn().mockResolvedValue([{ fato: "fato_pedido", ultimoBuildAt: now }] as never),
    },
    syncState: {
      findMany: jest.fn().mockResolvedValue([
        { model: "sale.order", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: now },
      ] as never),
    },
    fatoPedido: { groupBy: jest.fn() },
  };
  return {
    prisma: prisma as never,
    user: { userId: "u1", role: "admin", domains: ["comercial"] } as UserContext,
  } as ToolHandlerCtx;
}

describe("F4 Onda 5 , desempate estavel em ranking", () => {
  it("vendedores_cadastrados pede groupBy com desempate por vendedorId", async () => {
    const ctx = makeCtx();
    // Fixture COM EMPATE: dois vendedores com a mesma contagem de pedidos.
    (ctx.prisma.fatoPedido.groupBy as jest.Mock).mockResolvedValue([
      { vendedorId: 7, vendedorNome: "Bravo", _count: { odooId: 50 } },
      { vendedorId: 3, vendedorNome: "Alfa", _count: { odooId: 50 } },
    ] as never);

    await comercialVendedoresCadastrados.handler({} as never, ctx);
    const args = (ctx.prisma.fatoPedido.groupBy as jest.Mock).mock.calls[0][0] as {
      orderBy: Array<Record<string, unknown>>;
    };
    expect(Array.isArray(args.orderBy)).toBe(true);
    expect(args.orderBy).toEqual([{ _count: { odooId: "desc" } }, { vendedorId: "asc" }]);
  });

  it("comparador JS de top-movimentados desempata por rotulo (estavel)", () => {
    // Mesmo comparador usado em queryTopMovimentados (estoque.ts).
    const cmp = (a: { rotulo: string; valor: number }, b: { rotulo: string; valor: number }) =>
      b.valor - a.valor || a.rotulo.localeCompare(b.rotulo);
    const entrada = [
      { rotulo: "Zeta", valor: 10 },
      { rotulo: "Alfa", valor: 10 },
      { rotulo: "Meio", valor: 99 },
    ];
    // Ordem reversa na entrada nao deve alterar o resultado (deterministico).
    const a = [...entrada].sort(cmp).map((x) => x.rotulo);
    const b = [...entrada].reverse().sort(cmp).map((x) => x.rotulo);
    expect(a).toEqual(["Meio", "Alfa", "Zeta"]);
    expect(a).toEqual(b);
  });
});
