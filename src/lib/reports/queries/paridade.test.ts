// src/lib/reports/queries/paridade.test.ts
//
// Teste de paridade dashboard×MCP (#IM-8).
// Verifica que tanto o wrapper F3 quanto a tool MCP delegam ao núcleo de query,
// sem recomputar a agregação internamente.
//
// Nota de configuração Jest (achado N7):
// O projeto usa `preset: "ts-jest"` sem `extensionsToTreatAsEsm` e sem
// `--experimental-vm-modules` no script `test`. Isso significa que Jest roda
// com transform CJS (ts-jest compila módulos para CommonJS). Nesse modo,
// `jest.spyOn(mod, "fn")` intercepta a referência usada internamente por outro
// módulo do mesmo grafo CJS. A técnica de spy é válida e não requer
// `jest.unstable_mockModule`.

// ─── Setup de mocks ───────────────────────────────────────────────────────────
jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/actions/domain-access", () => ({ getMyDomains: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    fatoBuildState: { findUnique: jest.fn(), findMany: jest.fn() },
    fatoEstoqueSaldo: { findMany: jest.fn(), groupBy: jest.fn() },
    syncState: { findUnique: jest.fn(), findMany: jest.fn() },
  },
}));

import { getCurrentUser } from "@/lib/auth";
import type { AuthUser } from "@/lib/auth-helpers";
import { getMyDomains } from "@/lib/actions/domain-access";
import { prisma } from "@/lib/prisma";
import * as estoqueNucleo from "@/lib/reports/queries/estoque";
import { getRelatorioSaldoProduto, getRelatorioConcentracao } from "@/lib/actions/report-data";
import { estoqueSaldoProduto } from "../../../../mcp/tools/estoque/saldo-produto";
import { estoqueConcentracao } from "../../../../mcp/tools/estoque/concentracao";
import type { ToolHandlerCtx } from "../../../../mcp/catalog/types";
import type { UserContext } from "../../../../mcp/auth/user-context";

const mockGetCurrentUser = jest.mocked(getCurrentUser);
const mockGetMyDomains = jest.mocked(getMyDomains);
const mockPrisma = prisma as unknown as {
  fatoBuildState: { findUnique: jest.Mock; findMany: jest.Mock };
  fatoEstoqueSaldo: { findMany: jest.Mock; groupBy: jest.Mock };
  syncState: { findUnique: jest.Mock; findMany: jest.Mock };
};

beforeEach(() => {
  mockGetCurrentUser.mockResolvedValue({ id: "u1", platformRole: "admin" } as AuthUser);
  mockGetMyDomains.mockResolvedValue(["estoque"]);
  jest.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue({ id: "u1", platformRole: "admin" } as AuthUser);
  mockGetMyDomains.mockResolvedValue(["estoque"]);
});

function makeMcpPrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoEstoqueSaldo: { findMany: jest.fn(), groupBy: jest.fn() },
  };
}

// ─── Paridade R1: querySaldoProduto ───────────────────────────────────────────

describe("paridade R1 (saldo produto): dashboard e MCP delegam ao mesmo núcleo", () => {
  it("getRelatorioSaldoProduto chama querySaldoProduto", async () => {
    const spy = jest.spyOn(estoqueNucleo, "querySaldoProduto").mockResolvedValue({
      kpis: { totalProdutos: 0, produtosNegativos: 0, valorTotal: 0 },
      linhas: [],
    });
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    mockPrisma.syncState.findUnique.mockResolvedValue({ lastSnapshotAt: new Date() });

    await getRelatorioSaldoProduto({});
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("estoqueSaldoProduto.handler chama querySaldoProduto", async () => {
    const spy = jest.spyOn(estoqueNucleo, "querySaldoProduto").mockResolvedValue({
      kpis: { totalProdutos: 0, produtosNegativos: 0, valorTotal: 0 },
      linhas: [],
    });
    const mcpPrisma = makeMcpPrisma();
    (mcpPrisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_estoque_saldo", ultimoBuildAt: new Date() },
    ]);
    (mcpPrisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "estoque.saldo.hoje", lastStatus: "ok", lastSnapshotAt: new Date(), lastIncrementalAt: null },
    ]);
    const ctx: ToolHandlerCtx = {
      prisma: mcpPrisma as never,
      user: { userId: "u1", role: "admin", domains: ["estoque"] } as UserContext,
    };
    await estoqueSaldoProduto.handler({}, ctx);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

// ─── Paridade R6: queryConcentracao ───────────────────────────────────────────

describe("paridade R6 (concentração): dashboard e MCP delegam ao mesmo núcleo", () => {
  it("getRelatorioConcentracao chama queryConcentracao", async () => {
    const spy = jest.spyOn(estoqueNucleo, "queryConcentracao").mockResolvedValue({
      familiasBruto: [],
      marcasBruto: [],
    });
    mockPrisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
    mockPrisma.syncState.findUnique.mockResolvedValue({ lastSnapshotAt: new Date() });

    await getRelatorioConcentracao({});
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("estoqueConcentracao.handler chama queryConcentracao", async () => {
    const spy = jest.spyOn(estoqueNucleo, "queryConcentracao").mockResolvedValue({
      familiasBruto: [],
      marcasBruto: [],
    });
    const mcpPrisma = makeMcpPrisma();
    (mcpPrisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_estoque_saldo", ultimoBuildAt: new Date() },
    ]);
    (mcpPrisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "estoque.saldo.hoje", lastStatus: "ok", lastSnapshotAt: new Date(), lastIncrementalAt: null },
    ]);
    const ctx: ToolHandlerCtx = {
      prisma: mcpPrisma as never,
      user: { userId: "u1", role: "admin", domains: ["estoque"] } as UserContext,
    };
    await estoqueConcentracao.handler({}, ctx);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
