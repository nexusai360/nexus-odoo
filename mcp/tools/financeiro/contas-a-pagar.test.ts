// mcp/tools/financeiro/contas-a-pagar.test.ts
import { financeiroContasAPagar } from "./contas-a-pagar.js";
import { assertToolAllowed } from "../../catalog/registry.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoFinanceiroTitulo: { findMany: jest.fn() },
    ...overrides,
  };
}

function makeCtx(role = "admin", domains: string[] = ["financeiro"]): ToolHandlerCtx {
  return {
    prisma: makePrisma() as never,
    user: { userId: "u1", role, domains } as UserContext,
  };
}

describe("financeiro_contas_a_pagar", () => {
  it("devolve estado:'preparando' quando FatoBuildState ausente", async () => {
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([]);
    const result = await financeiroContasAPagar.handler({}, ctx);
    expect(result).toEqual({ estado: "preparando" });
  });

  it("devolve dados com totalAPagar e dataVencimento como ISO", async () => {
    const now = new Date("2026-05-18T10:00:00Z");
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_financeiro_titulo", ultimoBuildAt: now },
    ]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "finan.pagamento.divida", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
    ]);
    // Fixture formato finan.lancamento: vrSaldo == vrTotal quando aberto
    (ctx.prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([
      {
        participanteNome: "Fornecedor X",
        numeroDocumento: "BOL-001",
        dataVencimento: new Date("2026-05-15"),
        vrSaldo: "5314.75",
        vrTotal: "5314.75",
      },
    ]);
    const result = await financeiroContasAPagar.handler({}, ctx);
    expect(result).toMatchObject({ estado: "ok" });
    if (result.estado !== "preparando") {
      expect(result.dados.titulos[0].dataVencimento).toBe("2026-05-15T00:00:00.000Z");
      expect(result.dados.titulos[0].vrSaldo).toBeCloseTo(5314.75);
      expect(result.dados.titulos[0].vrTotal).toBeCloseTo(5314.75);
      // totalAPagar usa vrSaldo
      expect(result.dados.totalAPagar).toBeCloseTo(5314.75);
    }
  });

  // Regressão: o critério correto é situacaoSimples='aberto', não dataPagamento=null.
  it("título aberto (situacaoSimples='aberto') aparece no resultado", async () => {
    const now = new Date("2026-05-18T10:00:00Z");
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_financeiro_titulo", ultimoBuildAt: now },
    ]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "finan.pagamento.divida", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
    ]);
    // Mock simula o banco já tendo filtrado por situacaoSimples='aberto' (finan.lancamento)
    (ctx.prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([
      { participanteNome: "Fornecedor X", numeroDocumento: "BOL-001", dataVencimento: new Date("2026-05-15"), vrSaldo: "5314.75", vrTotal: "5314.75" },
    ]);
    const result = await financeiroContasAPagar.handler({}, ctx);
    if (result.estado !== "preparando") {
      expect(result.dados.titulos).toHaveLength(1);
      // totalAPagar usa vrSaldo
      expect(result.dados.totalAPagar).toBeCloseTo(5314.75);
    }
  });

  it("quando banco devolve vazio (todos quitados), resultado é estado:'vazio'", async () => {
    const now = new Date("2026-05-18T10:00:00Z");
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_financeiro_titulo", ultimoBuildAt: now },
    ]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "finan.pagamento.divida", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
    ]);
    // Mock simula banco sem nenhum título aberto
    (ctx.prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([]);
    const result = await financeiroContasAPagar.handler({}, ctx);
    expect(result.estado).toBe("vazio");
  });

  it("assertToolAllowed nega viewer sem domínio financeiro", () => {
    const viewer: UserContext = { userId: "u2", role: "viewer", domains: [] } as UserContext;
    expect(() => assertToolAllowed(financeiroContasAPagar as never, viewer)).toThrow();
  });

  // Onda 1.B: envelope canonico aplicado.
  it("retorna _RESPOSTA, _DESTAQUE, topPorParticipante e _agregado (envelope Onda 1.B)", async () => {
    const now = new Date("2026-05-18T10:00:00Z");
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_financeiro_titulo", ultimoBuildAt: now },
    ]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "finan.pagamento.divida", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
    ]);
    (ctx.prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([
      { participanteNome: "Jds", numeroDocumento: "A", dataVencimento: new Date("2026-05-15"), vrSaldo: "600", vrTotal: "600" },
      { participanteNome: "Jds", numeroDocumento: "B", dataVencimento: new Date("2026-05-16"), vrSaldo: "200", vrTotal: "200" },
      { participanteNome: "Casa Ferolla", numeroDocumento: "C", dataVencimento: new Date("2026-05-17"), vrSaldo: "200", vrTotal: "200" },
    ]);
    const result = await financeiroContasAPagar.handler({}, ctx);
    if (result.estado !== "preparando") {
      expect(typeof result.dados._RESPOSTA).toBe("string");
      expect(result.dados._RESPOSTA).toContain("Total em aberto a pagar");
      expect(result.dados._RESPOSTA).toContain("Jds");
      expect(result.dados._listaTruncada).toBe(false);
      expect(result.dados._DESTAQUE?.totalAPagar).toBe(1000);
      expect(result.dados._DESTAQUE?.contagem).toBe(3);
      expect(result.dados.topPorParticipante?.[0]?.nome).toBe("Jds");
      expect(result.dados.topPorParticipante?.[0]?.soma).toBe(800);
      expect(result.dados._agregado?.soma).toBe(1000);
    }
  });
});
