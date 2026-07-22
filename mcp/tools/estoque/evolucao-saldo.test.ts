import { estoqueEvolucaoSaldo } from "./evolucao-saldo.js";
import { assertToolAllowed } from "../../catalog/registry.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";
import { invalidarCacheCorte } from "@/lib/corte-dados";

const NOW = new Date("2026-06-01T12:00:00Z");

function makePrisma() {
  return {
    fatoBuildState: {
      findMany: jest.fn().mockResolvedValue([{ fato: "fato_estoque_saldo", ultimoBuildAt: NOW }]),
    },
    syncState: { findMany: jest.fn().mockResolvedValue([]) },
    appSetting: { findUnique: jest.fn().mockResolvedValue({ key: "sync.corte_dados", value: "2026-03-16" }) },
    fatoCapturaRodada: { findMany: jest.fn().mockResolvedValue([]) },
    fatoEstoqueSaldo: { count: jest.fn().mockResolvedValue(1) },
    fatoEstoqueMovimento: { count: jest.fn().mockResolvedValue(1) },
    fatoEstoqueSaldoHistorico: {
      findFirst: jest.fn().mockResolvedValue({ quantidade: "5", vrSaldo: "500.00" }),
      findMany: jest.fn().mockResolvedValue([
        { capturadoEm: new Date("2026-05-01T10:00:00Z"), quantidade: "8", vrSaldo: "800.00", evento: "mudanca" },
        { capturadoEm: new Date("2026-05-20T10:00:00Z"), quantidade: "6", vrSaldo: "600.00", evento: "mudanca" },
      ]),
    },
  };
}

function makeCtx(prisma: ReturnType<typeof makePrisma>, role = "admin", domains: string[] = ["estoque"]): ToolHandlerCtx {
  return { prisma: prisma as never, user: { userId: "u1", role, domains } as UserContext };
}

describe("estoque_evolucao_saldo", () => {
  beforeEach(() => invalidarCacheCorte());

  it("Zod aceita so produtoId e tambem com localId", () => {
    expect(estoqueEvolucaoSaldo.inputSchema.safeParse({ produtoId: 1 }).success).toBe(true);
    expect(estoqueEvolucaoSaldo.inputSchema.safeParse({ produtoId: 1, localId: 11 }).success).toBe(true);
    expect(estoqueEvolucaoSaldo.inputSchema.safeParse({}).success).toBe(false);
  });

  it("preparando quando FatoBuildState ausente", async () => {
    const prisma = makePrisma();
    prisma.fatoBuildState.findMany.mockResolvedValue([]);
    const result = await estoqueEvolucaoSaldo.handler({ produtoId: 1 } as never, makeCtx(prisma));
    expect(result).toEqual({ estado: "preparando" });
  });

  it("serie com pontos e carry-forward (inicial)", async () => {
    const prisma = makePrisma();
    const result = await estoqueEvolucaoSaldo.handler({ produtoId: 162, localId: 11 } as never, makeCtx(prisma));
    expect(result.estado).toBe("ok");
    if (result.estado === "preparando") return;
    expect(result.dados.pontos).toHaveLength(2);
    expect(result.dados.inicial).toMatchObject({ quantidade: "5", vrSaldo: "500.00" });
  });

  it("janela default materializa de/ate concretos (ate com hora)", async () => {
    const prisma = makePrisma();
    const result = await estoqueEvolucaoSaldo.handler({ produtoId: 1 } as never, makeCtx(prisma));
    if (result.estado === "preparando") throw new Error("nao deveria estar preparando");
    expect(typeof result.dados.de).toBe("string");
    expect(result.dados.ate).toContain("T");
  });

  it("envelope tem _RESPOSTA/_DESTAQUE/aviso", async () => {
    const prisma = makePrisma();
    const result = await estoqueEvolucaoSaldo.handler({ produtoId: 1 } as never, makeCtx(prisma));
    if (result.estado === "preparando") throw new Error("nao deveria estar preparando");
    expect(result.dados._RESPOSTA).toBeTruthy();
    expect(result.dados._DESTAQUE).toBeTruthy();
    expect(result.dados.aviso).toBeTruthy();
  });

  it("assertToolAllowed nega viewer sem dominio estoque", () => {
    const viewer: UserContext = { userId: "u2", role: "viewer", domains: [] } as UserContext;
    expect(() => assertToolAllowed(estoqueEvolucaoSaldo as never, viewer)).toThrow();
  });
});
