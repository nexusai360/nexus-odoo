import { fiscalFaturamentoPorCliente } from "./faturamento-por-cliente.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

// Fase 2.5: a tool consome a camada canonica (faturamentoPorClienteCanon -> core
// carregarItensVendaComGrupo). Paginacao em memoria por cliente EXTERNO; total =
// clientes externos distintos. O mock reproduz o caminho do core (groupBy item +
// findMany notas + fatoParceiro).

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoNotaFiscal: { findMany: jest.fn() },
    fatoNotaFiscalItem: { groupBy: jest.fn(), findMany: jest.fn() },
    fatoParceiro: { findMany: jest.fn().mockResolvedValue([]) },
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

// n clientes externos distintos, cada um uma nota de venda (cfop 1) com valor decrescente.
function primeCanonico(ctx: ToolHandlerCtx, n: number) {
  const dataEmissao = new Date("2026-03-10T00:00:00Z");
  const grupos = Array.from({ length: n }, (_, i) => ({
    documentoId: i + 1,
    cfopId: 1,
    _sum: { vrProdutos: n - i },
    _count: 1,
  }));
  const notas = Array.from({ length: n }, (_, i) => ({
    odooId: i + 1,
    participanteId: 1000 + i, // externo (fora da whitelist/cadastro)
    participanteNome: `C${String(i + 1).padStart(2, "0")}`,
    empresaId: 4,
    empresaNome: "Jds",
    dataEmissao,
  }));
  (ctx.prisma.fatoNotaFiscalItem.groupBy as jest.Mock).mockResolvedValue(grupos);
  (ctx.prisma.fatoNotaFiscalItem.findMany as jest.Mock).mockResolvedValue([{ cfopId: 1, cfopNome: "5102 - Venda" }]);
  (ctx.prisma.fatoNotaFiscal.findMany as jest.Mock).mockResolvedValue(notas);
}

describe("fiscal_faturamento_por_cliente , paginacao em memoria (alavanca 2b)", () => {
  it("fatia [offset, offset+limit) e total = clientes distintos", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    primeCanonico(ctx, 25);

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
    primeCanonico(ctx, 25);

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
    primeCanonico(ctx, 25);

    const r = await fiscalFaturamentoPorCliente.handler({ limit: 10, offset: 20 } as never, ctx);
    if (r.estado !== "preparando") {
      expect(r.dados.linhas.length).toBe(5);
      expect(r.dados._PAGINACAO.temMais).toBe(false);
      expect(r.dados._PAGINACAO.proximoOffset).toBeNull();
    }
  });
});
