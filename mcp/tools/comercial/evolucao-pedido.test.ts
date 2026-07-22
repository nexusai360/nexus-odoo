import { comercialEvolucaoPedido } from "./evolucao-pedido.js";
import { assertToolAllowed } from "../../catalog/registry.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

const NOW = new Date("2026-07-22T12:00:00Z");

function makePrisma(pontos: unknown[]) {
  return {
    fatoBuildState: { findMany: jest.fn().mockResolvedValue([{ fato: "fato_pedido", ultimoBuildAt: NOW }]) },
    syncState: { findMany: jest.fn().mockResolvedValue([]) },
    fatoPedidoValorHistorico: { findMany: jest.fn().mockResolvedValue(pontos) },
  };
}

function makeCtx(prisma: ReturnType<typeof makePrisma>, role = "admin", domains = ["comercial"]): ToolHandlerCtx {
  return { prisma: prisma as never, user: { userId: "u1", role, domains } as UserContext };
}

const ponto = (over: Record<string, unknown> = {}) => ({
  capturadoEm: new Date("2026-07-20T04:00:00Z"),
  evento: "mudanca",
  etapaId: 7,
  etapaNome: "Producao",
  saldoAtenderVenda: "3250",
  saldoAtenderCusto: "700",
  alMargem: "95",
  vrDesconto: "0",
  vrOperacaoTributacao: "3250",
  vrCbs: "29.25",
  vrIbs: "3.25",
  ...over,
});

describe("comercial_evolucao_pedido", () => {
  it("Zod exige pedidoId inteiro", () => {
    expect(comercialEvolucaoPedido.inputSchema.safeParse({}).success).toBe(false);
    expect(comercialEvolucaoPedido.inputSchema.safeParse({ pedidoId: 2016 }).success).toBe(true);
  });

  it("preparando quando FatoBuildState ausente", async () => {
    const prisma = makePrisma([ponto()]);
    prisma.fatoBuildState.findMany.mockResolvedValue([]);
    const r = await comercialEvolucaoPedido.handler({ pedidoId: 2016 } as never, makeCtx(prisma));
    expect(r).toEqual({ estado: "preparando" });
  });

  it("serie com pontos: converte Decimal->string e ordena", async () => {
    const prisma = makePrisma([
      ponto({ capturadoEm: new Date("2026-07-20T04:00:00Z"), alMargem: "90" }),
      ponto({ capturadoEm: new Date("2026-07-21T04:00:00Z"), alMargem: "95" }),
    ]);
    const r = await comercialEvolucaoPedido.handler({ pedidoId: 2016 } as never, makeCtx(prisma));
    expect(r.estado).toBe("ok");
    if (r.estado === "preparando") return;
    expect(r.dados.totalPontos).toBe(2);
    expect(r.dados.pontos[0].alMargem).toBe("90");
    expect(r.dados.pontos[1].vrCbs).toBe("29.25");
    expect(r.dados._RESPOSTA).toContain("2016");
    expect(String(r.dados._RESPOSTA)).toContain("Margem inicial era 90");
  });

  it("sem pontos: _RESPOSTA honesta (serie comeca em 2026-07)", async () => {
    const prisma = makePrisma([]);
    const r = await comercialEvolucaoPedido.handler({ pedidoId: 999 } as never, makeCtx(prisma));
    if (r.estado === "preparando") throw new Error("nao deveria estar preparando");
    expect(r.dados.totalPontos).toBe(0);
    expect(String(r.dados._RESPOSTA)).toContain("Sem historico");
  });

  it("assertToolAllowed nega viewer sem dominio comercial", () => {
    const viewer: UserContext = { userId: "u2", role: "viewer", domains: [] } as UserContext;
    expect(() => assertToolAllowed(comercialEvolucaoPedido as never, viewer)).toThrow();
  });
});
