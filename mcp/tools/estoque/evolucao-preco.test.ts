import { estoqueEvolucaoPreco } from "./evolucao-preco.js";
import { assertToolAllowed } from "../../catalog/registry.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";
import { invalidarCacheCorte } from "@/lib/corte-dados";

const NOW = new Date("2026-06-01T12:00:00Z");

function makePrisma(faixas: number[] = [0]) {
  return {
    fatoBuildState: {
      findMany: jest.fn().mockResolvedValue([{ fato: "fato_preco", ultimoBuildAt: NOW }]),
    },
    syncState: { findMany: jest.fn().mockResolvedValue([]) },
    appSetting: { findUnique: jest.fn().mockResolvedValue({ key: "sync.corte_dados", value: "2026-03-16" }) },
    fatoCapturaRodada: { findMany: jest.fn().mockResolvedValue([]) },
    fatoPrecoHistorico: {
      // carry-forward (findFirst): ponto anterior a janela.
      findFirst: jest.fn().mockResolvedValue({ valor: "10.00" }),
      // findMany atende DUAS chamadas: o distinct de faixas e os pontos da serie.
      findMany: jest.fn().mockImplementation((args?: { distinct?: unknown }) => {
        if (args?.distinct) return Promise.resolve(faixas.map((q) => ({ quantidadeMinima: { toNumber: () => q } })));
        return Promise.resolve([
          { capturadoEm: new Date("2026-05-01T10:00:00Z"), valor: "12.00", evento: "mudanca" },
          { capturadoEm: new Date("2026-05-20T10:00:00Z"), valor: "13.50", evento: "mudanca" },
        ]);
      }),
    },
  };
}

function makeCtx(prisma: ReturnType<typeof makePrisma>, role = "admin", domains: string[] = ["estoque"]): ToolHandlerCtx {
  return { prisma: prisma as never, user: { userId: "u1", role, domains } as UserContext };
}

describe("estoque_evolucao_preco", () => {
  beforeEach(() => invalidarCacheCorte());

  it("Zod exige tabelaId", () => {
    expect(estoqueEvolucaoPreco.inputSchema.safeParse({ produtoId: 1 }).success).toBe(false);
    expect(estoqueEvolucaoPreco.inputSchema.safeParse({ produtoId: 1, tabelaId: 3 }).success).toBe(true);
  });

  it("preparando quando FatoBuildState ausente", async () => {
    const prisma = makePrisma();
    prisma.fatoBuildState.findMany.mockResolvedValue([]);
    const result = await estoqueEvolucaoPreco.handler({ produtoId: 1, tabelaId: 3 } as never, makeCtx(prisma));
    expect(result).toEqual({ estado: "preparando" });
  });

  it("com quantidadeMinima -> uma serie (sem distinct)", async () => {
    const prisma = makePrisma();
    const result = await estoqueEvolucaoPreco.handler(
      { produtoId: 1, tabelaId: 3, quantidadeMinima: 5 } as never,
      makeCtx(prisma),
    );
    expect(result.estado).toBe("ok");
    if (result.estado === "preparando") return;
    expect(result.dados.series).toHaveLength(1);
    expect(result.dados.series[0].quantidadeMinima).toBe(5);
    expect(result.dados.series[0].pontos).toHaveLength(2);
    expect(result.dados.series[0].inicial).toBe("10.00");
    // Nao consulta faixas distintas quando a faixa foi informada.
    const chamadasDistinct = prisma.fatoPrecoHistorico.findMany.mock.calls.filter((c) => (c[0] as { distinct?: unknown })?.distinct);
    expect(chamadasDistinct).toHaveLength(0);
  });

  it("sem quantidadeMinima -> uma serie por faixa distinta", async () => {
    const prisma = makePrisma([0, 10]);
    const result = await estoqueEvolucaoPreco.handler({ produtoId: 1, tabelaId: 3 } as never, makeCtx(prisma));
    expect(result.estado).toBe("ok");
    if (result.estado === "preparando") return;
    expect(result.dados.series).toHaveLength(2);
    expect(result.dados.series.map((s) => s.quantidadeMinima)).toEqual([0, 10]);
  });

  it("janela default materializa de/ate concretos (ate com hora, nao date-only)", async () => {
    const prisma = makePrisma();
    const result = await estoqueEvolucaoPreco.handler({ produtoId: 1, tabelaId: 3 } as never, makeCtx(prisma));
    if (result.estado === "preparando") throw new Error("nao deveria estar preparando");
    expect(typeof result.dados.de).toBe("string");
    expect(result.dados.ate).toContain("T"); // datetime completo (A-4)
  });

  it("envelope tem _RESPOSTA/_DESTAQUE/aviso", async () => {
    const prisma = makePrisma();
    const result = await estoqueEvolucaoPreco.handler({ produtoId: 1, tabelaId: 3 } as never, makeCtx(prisma));
    if (result.estado === "preparando") throw new Error("nao deveria estar preparando");
    expect(result.dados._RESPOSTA).toBeTruthy();
    expect(result.dados._DESTAQUE).toBeTruthy();
    expect(result.dados.aviso).toBeTruthy();
  });

  it("assertToolAllowed nega viewer sem dominio estoque", () => {
    const viewer: UserContext = { userId: "u2", role: "viewer", domains: [] } as UserContext;
    expect(() => assertToolAllowed(estoqueEvolucaoPreco as never, viewer)).toThrow();
  });
});
