// mcp/tools/estoque/concentracao.test.ts
import { estoqueConcentracao } from "./concentracao.js";
import { assertToolAllowed } from "../../catalog/registry.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoEstoqueSaldo: { groupBy: jest.fn() },
  };
}

function makeCtx(role = "admin", domains: string[] = ["estoque"]): ToolHandlerCtx {
  return {
    prisma: makePrisma() as never,
    user: { userId: "u1", role, domains } as UserContext,
  };
}

describe("estoque_concentracao", () => {
  it("devolve estado:'preparando' quando FatoBuildState ausente", async () => {
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([]);
    const result = await estoqueConcentracao.handler({}, ctx);
    expect(result).toEqual({ estado: "preparando" });
  });

  it("tool calcula percentual (shaping N8) com lista completa (sem agruparTopN)", async () => {
    const now = new Date("2026-05-01T12:00:00Z");
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_estoque_saldo", ultimoBuildAt: now },
    ]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "estoque.saldo.hoje", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: null },
    ]);
    (ctx.prisma.fatoEstoqueSaldo.groupBy as jest.Mock)
      .mockResolvedValueOnce([
        { familiaNome: "Cardio", _sum: { vrSaldo: 600 } },
        { familiaNome: "Musculação", _sum: { vrSaldo: 400 } },
      ])
      .mockResolvedValueOnce([
        { marcaNome: "Matrix", _sum: { vrSaldo: 1000 } },
      ]);
    const result = await estoqueConcentracao.handler({}, ctx);
    expect(result).toMatchObject({ estado: "ok" });
    if (result.estado !== "preparando") {
      expect(result.dados.familia).toHaveLength(2); // lista completa, sem agruparTopN
      expect(result.dados.familia[0]).toMatchObject({ familia: "Cardio", percentual: 60 });
      expect(result.dados.marca[0]).toMatchObject({ marca: "Matrix", percentual: 100 });
    }
  });

  it("assertToolAllowed nega viewer sem domínio estoque", () => {
    const viewer: UserContext = { userId: "u2", role: "viewer", domains: [] } as UserContext;
    expect(() => assertToolAllowed(estoqueConcentracao, viewer)).toThrow();
  });
});
