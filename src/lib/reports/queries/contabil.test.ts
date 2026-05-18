// src/lib/reports/queries/contabil.test.ts
import { queryPlanoDeContas, queryEstruturaConta } from "./contabil";

// ---------------------------------------------------------------------------
// queryPlanoDeContas
// ---------------------------------------------------------------------------

describe("queryPlanoDeContas", () => {
  it("retorna todas as contas sem termo (até limite padrão)", async () => {
    const mockLinhas = [
      { odooId: 4, codigo: "1", nome: "ATIVO", tipo: "S", contaPaiNome: null },
      { odooId: 5, codigo: "1.1", nome: "ATIVO CIRCULANTE", tipo: "S", contaPaiNome: "1 - ATIVO [D]" },
    ];
    const prisma = {
      fatoContaContabil: {
        findMany: jest.fn().mockResolvedValue(mockLinhas),
      },
    } as unknown as Parameters<typeof queryPlanoDeContas>[0];

    const result = await queryPlanoDeContas(prisma, {});
    expect(result.linhas).toHaveLength(2);
    expect(result.linhas[0].odooId).toBe(4);
    expect(result.linhas[0].codigo).toBe("1");
  });

  it("aplica filtro por termo (where.OR presente) e limite customizado", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      fatoContaContabil: { findMany },
    } as unknown as Parameters<typeof queryPlanoDeContas>[0];

    await queryPlanoDeContas(prisma, { termo: "1.1", limite: 50 });
    const call = findMany.mock.calls[0][0];
    expect(call.where).toHaveProperty("OR");
    expect(call.take).toBe(50);
  });

  it("usa limite padrão 100 quando não informado", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      fatoContaContabil: { findMany },
    } as unknown as Parameters<typeof queryPlanoDeContas>[0];

    await queryPlanoDeContas(prisma, {});
    const call = findMany.mock.calls[0][0];
    expect(call.take).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// queryEstruturaConta
// ---------------------------------------------------------------------------

describe("queryEstruturaConta", () => {
  it("(a) conta com filhas — retorna conta + filhas", async () => {
    const contaMock = { odooId: 5, codigo: "1.1", nome: "ATIVO CIRCULANTE", tipo: "S", contaPaiNome: "1 - ATIVO [D]" };
    const filhasMock = [{ odooId: 100, codigo: "1.1.1", nome: "CAIXA", tipo: "A" }];
    const prisma = {
      fatoContaContabil: {
        findUnique: jest.fn().mockResolvedValue(contaMock),
        findMany: jest.fn().mockResolvedValue(filhasMock),
      },
    } as unknown as Parameters<typeof queryEstruturaConta>[0];

    const result = await queryEstruturaConta(prisma, { odooId: 5 });
    expect(result.conta).not.toBeNull();
    expect(result.conta?.odooId).toBe(5);
    expect(result.conta?.contaPaiNome).toBe("1 - ATIVO [D]");
    expect(result.filhas).toHaveLength(1);
    expect(result.filhas[0].odooId).toBe(100);
  });

  it("(b) conta folha sem filhas — retorna conta + filhas vazio, estado ok", async () => {
    const contaMock = { odooId: 100, codigo: "1.1.1", nome: "CAIXA", tipo: "A", contaPaiNome: "ATIVO CIRCULANTE" };
    const prisma = {
      fatoContaContabil: {
        findUnique: jest.fn().mockResolvedValue(contaMock),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as Parameters<typeof queryEstruturaConta>[0];

    const result = await queryEstruturaConta(prisma, { odooId: 100 });
    expect(result.conta).not.toBeNull();
    expect(result.filhas).toHaveLength(0);
  });

  it("(c) conta inexistente — conta null, filhas vazio", async () => {
    const prisma = {
      fatoContaContabil: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as Parameters<typeof queryEstruturaConta>[0];

    const result = await queryEstruturaConta(prisma, { odooId: 9999 });
    expect(result.conta).toBeNull();
    expect(result.filhas).toHaveLength(0);
  });
});
