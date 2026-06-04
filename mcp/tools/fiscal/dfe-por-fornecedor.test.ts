import { fiscalDfePorFornecedor } from "./dfe-por-fornecedor.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

// EXCECAO de paginacao em memoria: a agregacao por fornecedor (cnpj) acontece
// em memoria, entao a tool fatia [offset, offset+limit) e o total e o numero de
// fornecedores distintos.

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoDfe: { findMany: jest.fn() },
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

// 25 fornecedores distintos, 1 nota cada (vrNf decrescente para ordem estavel).
function fakeRows(nFornecedores: number) {
  return Array.from({ length: nFornecedores }, (_, i) => ({
    cnpjFornecedor: String(10000000000000 + i),
    fornecedorNome: `F${i + 1}`,
    vrNf: nFornecedores - i,
  }));
}

describe("fiscal_dfe_por_fornecedor , paginacao em memoria (alavanca 2b)", () => {
  it("fatia [offset, offset+limit) e total = fornecedores distintos", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoDfe.findMany as jest.Mock).mockResolvedValue(fakeRows(25));

    const r = await fiscalDfePorFornecedor.handler({ limit: 10, offset: 0 } as never, ctx);
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
    (ctx.prisma.fatoDfe.findMany as jest.Mock).mockResolvedValue(fakeRows(25));

    const p1 = await fiscalDfePorFornecedor.handler({ limit: 10, offset: 0 } as never, ctx);
    const p2 = await fiscalDfePorFornecedor.handler({ limit: 10, offset: 10 } as never, ctx);
    if (p1.estado !== "preparando" && p2.estado !== "preparando") {
      const nomes1 = new Set(p1.dados.linhas.map((l) => l.fornecedorNome));
      const overlap = p2.dados.linhas.filter((l) => nomes1.has(l.fornecedorNome));
      expect(overlap.length).toBe(0);
    }
  });

  it("ultima pagina: temMais=false", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoDfe.findMany as jest.Mock).mockResolvedValue(fakeRows(25));

    const r = await fiscalDfePorFornecedor.handler({ limit: 10, offset: 20 } as never, ctx);
    if (r.estado !== "preparando") {
      expect(r.dados.linhas.length).toBe(5);
      expect(r.dados._PAGINACAO.temMais).toBe(false);
      expect(r.dados._PAGINACAO.proximoOffset).toBeNull();
    }
  });
});
