// mcp/tools/financeiro/titulos-vencidos.test.ts
import { financeiroTitulosVencidos } from "./titulos-vencidos.js";
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

describe("financeiro_titulos_vencidos", () => {
  it("devolve estado:'preparando' quando FatoBuildState ausente", async () => {
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([]);
    const result = await financeiroTitulosVencidos.handler({}, ctx);
    expect(result).toEqual({ estado: "preparando" });
  });

  it("devolve dados com tipo, totalVencido e dataVencimento ISO", async () => {
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
        tipo: "a_receber",
        participanteNome: "Cliente Z",
        numeroDocumento: "NF-100",
        dataVencimento: new Date("2026-04-01"),
        vrSaldo: "2000.00",
        vrTotal: "2000.00",
      },
    ]);
    const result = await financeiroTitulosVencidos.handler({}, ctx);
    expect(result).toMatchObject({ estado: "ok" });
    if (result.estado !== "preparando") {
      expect(result.dados.titulos[0].tipo).toBe("a_receber");
      expect(result.dados.titulos[0].dataVencimento).toBe("2026-04-01T00:00:00.000Z");
      expect(result.dados.titulos[0].vrSaldo).toBe(2000);
      expect(result.dados.titulos[0].vrTotal).toBe(2000);
      // totalVencido usa vrSaldo
      expect(result.dados.totalVencido).toBe(2000);
    }
  });

  it("contrato de lista (Fase B): expõe ordenadoPor e topMaiores por valor desc", async () => {
    const now = new Date("2026-05-18T10:00:00Z");
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_financeiro_titulo", ultimoBuildAt: now },
    ]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "finan.pagamento.divida", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
    ]);
    // 3 títulos fora de ordem de valor: o contrato garante topMaiores ordenado.
    (ctx.prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([
      { tipo: "a_pagar", participanteNome: "Pequeno", numeroDocumento: "D-1", dataVencimento: new Date("2026-04-01"), vrSaldo: "100.00", vrTotal: "100.00", situacaoSimples: "aberto" },
      { tipo: "a_pagar", participanteNome: "Johnson", numeroDocumento: "D-2", dataVencimento: new Date("2026-04-02"), vrSaldo: "170000000.00", vrTotal: "170000000.00", situacaoSimples: "provisorio" },
      { tipo: "a_pagar", participanteNome: "Medio", numeroDocumento: "D-3", dataVencimento: new Date("2026-04-03"), vrSaldo: "5000.00", vrTotal: "5000.00", situacaoSimples: "aberto" },
    ]);
    const result = await financeiroTitulosVencidos.handler({ tipo: "a_pagar" }, ctx);
    expect(result.estado).toBe("ok");
    if (result.estado !== "preparando") {
      const dados = result.dados as unknown as Record<string, unknown>;
      expect(dados["ordenadoPor"]).toBe("valor desc");
      const top = dados["topMaiores"] as { nome: string; valor: number }[];
      expect(top[0].nome).toBe("Johnson");
      expect(top[0].valor).toBe(170000000);
      expect(top).toHaveLength(3);
      expect(top[1].valor).toBeGreaterThanOrEqual(top[2].valor);
    }
  });

  it("devolve estado:'vazio' quando não há títulos vencidos", async () => {
    const now = new Date("2026-05-18T10:00:00Z");
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_financeiro_titulo", ultimoBuildAt: now },
    ]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "finan.pagamento.divida", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
    ]);
    (ctx.prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([]);
    const result = await financeiroTitulosVencidos.handler({}, ctx);
    expect(result).toMatchObject({ estado: "vazio" });
  });

  // Regressão: o critério correto é situacaoSimples='aberto' + dataVencimento < hoje.
  it("título aberto e vencido aparece no resultado", async () => {
    const now = new Date("2026-05-18T10:00:00Z");
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_financeiro_titulo", ultimoBuildAt: now },
    ]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "finan.pagamento.divida", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
    ]);
    // Mock simula banco retornando apenas títulos abertos e vencidos (finan.lancamento)
    (ctx.prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([
      { tipo: "a_receber", participanteNome: "Cliente Z", numeroDocumento: "NF-100", dataVencimento: new Date("2026-04-01"), vrSaldo: "2000.00", vrTotal: "2000.00" },
    ]);
    const result = await financeiroTitulosVencidos.handler({}, ctx);
    if (result.estado !== "preparando") {
      expect(result.dados.titulos).toHaveLength(1);
      // totalVencido usa vrSaldo
      expect(result.dados.totalVencido).toBe(2000);
    }
  });

  it("título quitado não aparece (banco filtra por situacaoSimples='aberto')", async () => {
    const now = new Date("2026-05-18T10:00:00Z");
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_financeiro_titulo", ultimoBuildAt: now },
    ]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "finan.pagamento.divida", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
    ]);
    // Mock simula banco com nenhum resultado (quitados foram filtrados antes)
    (ctx.prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([]);
    const result = await financeiroTitulosVencidos.handler({}, ctx);
    expect(result.estado).toBe("vazio");
  });

  it("assertToolAllowed nega viewer sem domínio financeiro", () => {
    const viewer: UserContext = { userId: "u2", role: "viewer", domains: [] } as UserContext;
    expect(() => assertToolAllowed(financeiroTitulosVencidos as never, viewer)).toThrow();
  });
});
