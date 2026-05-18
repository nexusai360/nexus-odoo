// mcp/tools/estoque/valor-armazem.test.ts
import { estoqueValorArmazem } from "./valor-armazem.js";
import { assertToolAllowed } from "../../catalog/registry.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoEstoqueSaldo: { findMany: jest.fn() },
  };
}

function makeCtx(role = "admin", domains: string[] = ["estoque"]): ToolHandlerCtx {
  return {
    prisma: makePrisma() as never,
    user: { userId: "u1", role, domains } as UserContext,
  };
}

describe("estoque_valor_armazem", () => {
  it("devolve estado:'preparando' quando FatoBuildState ausente", async () => {
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([]);
    const result = await estoqueValorArmazem.handler({}, ctx);
    expect(result).toEqual({ estado: "preparando" });
  });

  it("devolve estado:'ok' com linhas que incluem percentual", async () => {
    const now = new Date("2026-05-01T12:00:00Z");
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_estoque_saldo", ultimoBuildAt: now },
    ]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "estoque.saldo.hoje", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: null },
    ]);
    (ctx.prisma.fatoEstoqueSaldo.findMany as jest.Mock).mockResolvedValue([
      { localNome: "Galpão A » Próprio", produtoId: 1, vrSaldo: 1000 },
      { localNome: "Virtual", produtoId: 2, vrSaldo: 400 },
    ]);
    const result = await estoqueValorArmazem.handler({}, ctx);
    expect(result).toMatchObject({ estado: "ok" });
    if (result.estado !== "preparando") {
      expect(result.dados.linhas).toHaveLength(2);
      expect(result.dados.linhas[0]!.percentual).toBeCloseTo((1000 / 1400) * 100, 3);
      expect(result.dados.kpis.valorTotal).toBe(1400);
    }
  });

  it("assertToolAllowed nega viewer sem domínio estoque", () => {
    const viewer: UserContext = { userId: "u2", role: "viewer", domains: [] } as UserContext;
    expect(() => assertToolAllowed(estoqueValorArmazem as never, viewer)).toThrow();
  });
});
