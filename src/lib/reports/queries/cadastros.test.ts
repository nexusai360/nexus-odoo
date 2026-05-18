// src/lib/reports/queries/cadastros.test.ts

import { queryBuscarParceiro, queryParceirosPorUf, queryContarParceiros } from "./cadastros";

// Placeholder de tipo
const fakePrisma = {} as Parameters<typeof queryBuscarParceiro>[0];

// ---------------------------------------------------------------------------
// queryBuscarParceiro — D.4
// ---------------------------------------------------------------------------

describe("queryBuscarParceiro", () => {
  it("busca por nome via ILIKE e devolve campos esperados", async () => {
    const mockPrisma = {
      fatoParceiro: {
        findMany: jest.fn().mockResolvedValue([
          {
            odooId: 1001,
            nome: "Empresa Fitness SA",
            documento: "12.345.678/0001-99",
            ehCliente: true,
            ehFornecedor: false,
            uf: "DF",
            cidade: "Brasília",
          },
        ]),
      },
    } as unknown as Parameters<typeof queryBuscarParceiro>[0];

    const result = await queryBuscarParceiro(mockPrisma, { termo: "Fitness" });
    expect(result.linhas).toHaveLength(1);
    expect(result.linhas[0].odooId).toBe(1001);
    expect(result.linhas[0].nome).toBe("Empresa Fitness SA");
    expect(result.linhas[0].ehCliente).toBe(true);
    expect(result.linhas[0].uf).toBe("DF");

    const call = (mockPrisma.fatoParceiro.findMany as jest.Mock).mock.calls[0][0];
    // deve usar OR de contains (ILIKE)
    expect(call.where?.OR).toBeDefined();
    expect(call.where.OR.length).toBeGreaterThanOrEqual(2);
  });

  it("aplica limite padrão de 20", async () => {
    const mockPrisma = {
      fatoParceiro: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as Parameters<typeof queryBuscarParceiro>[0];

    await queryBuscarParceiro(mockPrisma, { termo: "X" });
    const call = (mockPrisma.fatoParceiro.findMany as jest.Mock).mock.calls[0][0];
    expect(call.take).toBe(20);
  });

  it("respeita limite customizado", async () => {
    const mockPrisma = {
      fatoParceiro: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as Parameters<typeof queryBuscarParceiro>[0];

    await queryBuscarParceiro(mockPrisma, { termo: "X", limite: 5 });
    const call = (mockPrisma.fatoParceiro.findMany as jest.Mock).mock.calls[0][0];
    expect(call.take).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// queryParceirosPorUf — D.5
// ---------------------------------------------------------------------------

describe("queryParceirosPorUf", () => {
  it("agrupa por uf e retorna quantidade desc", async () => {
    const mockPrisma = {
      fatoParceiro: {
        findMany: jest.fn().mockResolvedValue([
          { uf: "DF" },
          { uf: "DF" },
          { uf: "SP" },
        ]),
      },
    } as unknown as Parameters<typeof queryParceirosPorUf>[0];

    const result = await queryParceirosPorUf(mockPrisma, {});
    expect(result.linhas.length).toBeGreaterThanOrEqual(2);
    // DF deve aparecer com quantidade 2
    const df = result.linhas.find((l) => l.uf === "DF");
    expect(df?.quantidade).toBe(2);
    // ordenado por quantidade desc
    const quantities = result.linhas.map((l) => l.quantidade);
    const sorted = [...quantities].sort((a, b) => b - a);
    expect(quantities).toEqual(sorted);
  });

  it("filtra apenas clientes quando apenasClientes=true", async () => {
    const mockPrisma = {
      fatoParceiro: { findMany: jest.fn().mockResolvedValue([{ uf: "SP" }]) },
    } as unknown as Parameters<typeof queryParceirosPorUf>[0];

    await queryParceirosPorUf(mockPrisma, { apenasClientes: true });
    const call = (mockPrisma.fatoParceiro.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.ehCliente).toBe(true);
  });

  it("sem filtro não restringe ehCliente", async () => {
    const mockPrisma = {
      fatoParceiro: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as Parameters<typeof queryParceirosPorUf>[0];

    await queryParceirosPorUf(mockPrisma, {});
    const call = (mockPrisma.fatoParceiro.findMany as jest.Mock).mock.calls[0][0];
    // não deve ter filtro de ehCliente
    expect(call.where?.ehCliente).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// queryContarParceiros — D.6
// ---------------------------------------------------------------------------

describe("queryContarParceiros", () => {
  it("retorna totais de parceiros, clientes, fornecedores e empresas", async () => {
    const mockPrisma = {
      fatoParceiro: {
        count: jest
          .fn()
          .mockResolvedValueOnce(100) // totalParceiros
          .mockResolvedValueOnce(70)  // totalClientes
          .mockResolvedValueOnce(30)  // totalFornecedores
          .mockResolvedValueOnce(20), // totalEmpresas
      },
    } as unknown as Parameters<typeof queryContarParceiros>[0];

    const result = await queryContarParceiros(mockPrisma);
    expect(result.totalParceiros).toBe(100);
    expect(result.totalClientes).toBe(70);
    expect(result.totalFornecedores).toBe(30);
    expect(result.totalEmpresas).toBe(20);
  });
});

// Placeholder para compatibilidade de tipo
void fakePrisma;
