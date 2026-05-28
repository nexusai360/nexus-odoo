// mcp/tools/financeiro/caixa-periodo.test.ts
import { financeiroCaixaPeriodo } from "./caixa-periodo.js";
import { assertToolAllowed } from "../../catalog/registry.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoFinanceiroMovimento: { findMany: jest.fn() },
    ...overrides,
  };
}

function makeCtx(role = "admin", domains: string[] = ["financeiro"]): ToolHandlerCtx {
  return {
    prisma: makePrisma() as never,
    user: { userId: "u1", role, domains } as UserContext,
  };
}

describe("financeiro_caixa_periodo", () => {
  it("devolve estado:'preparando' quando FatoBuildState ausente", async () => {
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([]);
    const result = await financeiroCaixaPeriodo.handler({}, ctx);
    expect(result).toEqual({ estado: "preparando" });
  });

  it("devolve estado:'ok' com dados de caixa", async () => {
    const now = new Date("2026-05-18T10:00:00Z");
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_financeiro_movimento", ultimoBuildAt: now },
    ]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "finan.fluxo.caixa", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
    ]);
    (ctx.prisma.fatoFinanceiroMovimento.findMany as jest.Mock).mockResolvedValue([
      { entrada: "1000", saida: "400" },
    ]);
    const result = await financeiroCaixaPeriodo.handler({}, ctx);
    expect(result).toMatchObject({ estado: "ok" });
    if (result.estado !== "preparando") {
      // T-38 (Ronda 3): dados agora inclui _RESPOSTA/_DESTAQUE/_agregado.
      // Validamos apenas os campos factuais.
      expect(result.dados).toMatchObject({ entrada: 1000, saida: 400, saldo: 600 });
    }
  });

  it("assertToolAllowed nega viewer sem domínio financeiro", () => {
    const viewer: UserContext = { userId: "u2", role: "viewer", domains: [] } as UserContext;
    expect(() => assertToolAllowed(financeiroCaixaPeriodo as never, viewer)).toThrow();
  });
});
