// mcp/tools/financeiro/saldo-contas.test.ts
import { financeiroSaldoContas } from "./saldo-contas.js";
import { assertToolAllowed } from "../../catalog/registry.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoFinanceiroSaldo: { findMany: jest.fn() },
    ...overrides,
  };
}

function makeCtx(role = "admin", domains: string[] = ["financeiro"]): ToolHandlerCtx {
  return {
    prisma: makePrisma() as never,
    user: { userId: "u1", role, domains } as UserContext,
  };
}

describe("financeiro_saldo_contas", () => {
  it("devolve estado:'preparando' quando FatoBuildState ausente", async () => {
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([]);
    const result = await financeiroSaldoContas.handler({}, ctx);
    expect(result).toEqual({ estado: "preparando" });
  });

  it("devolve estado:'ok' com dados e fonteStatus quando há build e contas", async () => {
    const now = new Date("2026-05-18T10:00:00Z");
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_financeiro_saldo", ultimoBuildAt: now },
    ]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "finan.banco.saldo.hoje", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: null },
    ]);
    (ctx.prisma.fatoFinanceiroSaldo.findMany as jest.Mock).mockResolvedValue([
      { bancoNome: "Itaú", tipo: "corrente", saldo: "1000.00" },
    ]);
    const result = await financeiroSaldoContas.handler({}, ctx);
    expect(result).toMatchObject({
      estado: "ok",
      atualizadoEm: now.toISOString(),
      fonteStatus: { status: "ok" },
    });
    if (result.estado !== "preparando") {
      expect(result.dados.contas).toHaveLength(1);
      expect(result.dados.saldoTotal).toBe(1000);
    }
  });

  it("devolve estado:'vazio' quando não há contas", async () => {
    const now = new Date("2026-05-18T10:00:00Z");
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_financeiro_saldo", ultimoBuildAt: now },
    ]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "finan.banco.saldo.hoje", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: null },
    ]);
    (ctx.prisma.fatoFinanceiroSaldo.findMany as jest.Mock).mockResolvedValue([]);
    const result = await financeiroSaldoContas.handler({}, ctx);
    expect(result).toMatchObject({ estado: "vazio" });
  });

  it("assertToolAllowed nega viewer sem domínio financeiro", () => {
    const viewer: UserContext = { userId: "u2", role: "viewer", domains: [] } as UserContext;
    expect(() => assertToolAllowed(financeiroSaldoContas as never, viewer)).toThrow();
  });
});
