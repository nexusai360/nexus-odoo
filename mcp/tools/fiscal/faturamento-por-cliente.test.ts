import { fiscalFaturamentoPorCliente } from "./faturamento-por-cliente.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

// EXCECAO de paginacao em memoria: agrega por cliente em memoria e fatia
// [offset, offset+limit); total = clientes distintos.

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoNotaFiscal: { findMany: jest.fn() },
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
  ]);
  (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
    { model: "sped.documento", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: now },
  ]);
}

function fakeRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    participanteNome: `C${String(i + 1).padStart(2, "0")}`,
    vrNf: n - i,
  }));
}

describe("fiscal_faturamento_por_cliente , paginacao em memoria (alavanca 2b)", () => {
  it("fatia [offset, offset+limit) e total = clientes distintos", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoNotaFiscal.findMany as jest.Mock).mockResolvedValue(fakeRows(25));

    const r = await fiscalFaturamentoPorCliente.handler({ limit: 10, offset: 0 } as never, ctx);
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
    (ctx.prisma.fatoNotaFiscal.findMany as jest.Mock).mockResolvedValue(fakeRows(25));

    const p1 = await fiscalFaturamentoPorCliente.handler({ limit: 10, offset: 0 } as never, ctx);
    const p2 = await fiscalFaturamentoPorCliente.handler({ limit: 10, offset: 10 } as never, ctx);
    if (p1.estado !== "preparando" && p2.estado !== "preparando") {
      const nomes1 = new Set(p1.dados.linhas.map((l) => l.participanteNome));
      const overlap = p2.dados.linhas.filter((l) => nomes1.has(l.participanteNome));
      expect(overlap.length).toBe(0);
    }
  });

  it("ultima pagina: temMais=false", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoNotaFiscal.findMany as jest.Mock).mockResolvedValue(fakeRows(25));

    const r = await fiscalFaturamentoPorCliente.handler({ limit: 10, offset: 20 } as never, ctx);
    if (r.estado !== "preparando") {
      expect(r.dados.linhas.length).toBe(5);
      expect(r.dados._PAGINACAO.temMais).toBe(false);
      expect(r.dados._PAGINACAO.proximoOffset).toBeNull();
    }
  });
});
