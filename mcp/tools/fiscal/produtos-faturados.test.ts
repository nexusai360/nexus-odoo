import { fiscalProdutosFaturados } from "./produtos-faturados.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

// EXCECAO de paginacao em memoria: agrega itens por produto em memoria e fatia
// [offset, offset+limit); total = produtos distintos.

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoNotaFiscalItem: { findMany: jest.fn() },
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
    { fato: "fato_nota_fiscal_item", ultimoBuildAt: now },
  ]);
  (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
    { model: "sped.documento.item", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: now },
  ]);
}

function fakeItens(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    produtoNome: `P${String(i + 1).padStart(2, "0")}`,
    quantidade: 1,
    vrProdutos: n - i,
  }));
}

describe("fiscal_produtos_faturados , paginacao em memoria (alavanca 2b)", () => {
  it("fatia [offset, offset+limit) e total = produtos distintos", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoNotaFiscalItem.findMany as jest.Mock).mockResolvedValue(fakeItens(25));

    const r = await fiscalProdutosFaturados.handler({ limit: 10, offset: 0 } as never, ctx);
    if (r.estado !== "preparando") {
      expect(r.dados.linhas.length).toBe(10);
      expect(r.dados._PAGINACAO.total).toBe(25);
      expect(r.dados._PAGINACAO.temMais).toBe(true);
      expect(r.dados._PAGINACAO.proximoOffset).toBe(10);
    }
  });

  it("segunda pagina nao se sobrepoe a primeira", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoNotaFiscalItem.findMany as jest.Mock).mockResolvedValue(fakeItens(25));

    const p1 = await fiscalProdutosFaturados.handler({ limit: 10, offset: 0 } as never, ctx);
    const p2 = await fiscalProdutosFaturados.handler({ limit: 10, offset: 10 } as never, ctx);
    if (p1.estado !== "preparando" && p2.estado !== "preparando") {
      const nomes1 = new Set(p1.dados.linhas.map((l) => l.produtoNome));
      const overlap = p2.dados.linhas.filter((l) => nomes1.has(l.produtoNome));
      expect(overlap.length).toBe(0);
    }
  });

  it("ultima pagina: temMais=false", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoNotaFiscalItem.findMany as jest.Mock).mockResolvedValue(fakeItens(25));

    const r = await fiscalProdutosFaturados.handler({ limit: 10, offset: 20 } as never, ctx);
    if (r.estado !== "preparando") {
      expect(r.dados.linhas.length).toBe(5);
      expect(r.dados._PAGINACAO.temMais).toBe(false);
      expect(r.dados._PAGINACAO.proximoOffset).toBeNull();
    }
  });
});
