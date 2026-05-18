// src/lib/reports/queries/comercial.test.ts
import {
  queryPedidosPeriodo,
  queryPedidosPorEtapa,
  queryPedidosPorVendedor,
  queryPedidosAtrasados,
  queryParcelasAVencer,
} from "./comercial";

// Mocks são definidos por cada describe conforme necessário
describe("queryPedidosPeriodo", () => {
  it("retorna totalPedidos e valorTotal sem filtro", async () => {
    const mockPrisma = {
      fatoPedido: {
        findMany: jest.fn().mockResolvedValue([
          { vrNf: { toNumber: () => 1000 } },
          { vrNf: { toNumber: () => 500 } },
        ]),
      },
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    // Sobrescrever com mock retornando Decimals como objetos com toNumber
    (mockPrisma.fatoPedido.findMany as jest.Mock).mockResolvedValue([
      { vrNf: "1000.00" },
      { vrNf: "500.00" },
    ]);

    const result = await queryPedidosPeriodo(mockPrisma, {});
    expect(result.totalPedidos).toBe(2);
    expect(result.valorTotal).toBeCloseTo(1500);
  });

  it("aplica filtro de período quando ambos presentes", async () => {
    const mockPrisma = {
      fatoPedido: {
        findMany: jest.fn().mockResolvedValue([{ vrNf: "200.00" }]),
      },
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    const result = await queryPedidosPeriodo(mockPrisma, {
      periodoDe: "2024-01-01",
      periodoAte: "2024-01-31",
    });
    expect(result.totalPedidos).toBe(1);
    expect(result.valorTotal).toBeCloseTo(200);

    const call = (mockPrisma.fatoPedido.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.dataOrcamento?.gte).toEqual(new Date("2024-01-01T00:00:00"));
    expect(call.where?.dataOrcamento?.lte).toEqual(new Date("2024-01-31T00:00:00"));
  });

  it("retorna zerado quando sem pedidos", async () => {
    const mockPrisma = {
      fatoPedido: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    const result = await queryPedidosPeriodo(mockPrisma, {});
    expect(result.totalPedidos).toBe(0);
    expect(result.valorTotal).toBe(0);
  });
});

describe("queryPedidosPorEtapa", () => {
  it("agrupa por etapaNome e retorna linhas com quantidade e valorTotal", async () => {
    const mockPrisma = {
      fatoPedido: {
        findMany: jest.fn().mockResolvedValue([
          { etapaNome: "Concluído", etapaFinaliza: true, vrNf: "1000.00" },
          { etapaNome: "Concluído", etapaFinaliza: true, vrNf: "500.00" },
          { etapaNome: "Em Aberto", etapaFinaliza: false, vrNf: "200.00" },
        ]),
      },
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    const result = await queryPedidosPorEtapa(mockPrisma);
    expect(result.linhas).toHaveLength(2);

    const concluido = result.linhas.find((l) => l.etapaNome === "Concluído");
    expect(concluido?.quantidade).toBe(2);
    expect(concluido?.valorTotal).toBeCloseTo(1500);
    expect(concluido?.etapaFinaliza).toBe(true);

    const aberto = result.linhas.find((l) => l.etapaNome === "Em Aberto");
    expect(aberto?.quantidade).toBe(1);
    expect(aberto?.valorTotal).toBeCloseTo(200);
    expect(aberto?.etapaFinaliza).toBe(false);
  });

  it("retorna array vazio quando sem pedidos", async () => {
    const mockPrisma = {
      fatoPedido: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    const result = await queryPedidosPorEtapa(mockPrisma);
    expect(result.linhas).toHaveLength(0);
  });
});

describe("queryPedidosPorVendedor", () => {
  it("agrupa por vendedorNome e retorna ordenado por valorTotal desc", async () => {
    const mockPrisma = {
      fatoPedido: {
        findMany: jest.fn().mockResolvedValue([
          { vendedorNome: "João", vrNf: "1000.00" },
          { vendedorNome: "Maria", vrNf: "3000.00" },
          { vendedorNome: "João", vrNf: "500.00" },
        ]),
      },
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    const result = await queryPedidosPorVendedor(mockPrisma, {});
    expect(result.linhas).toHaveLength(2);
    expect(result.linhas[0]!.vendedorNome).toBe("Maria");
    expect(result.linhas[0]!.valorTotal).toBeCloseTo(3000);
    expect(result.linhas[1]!.vendedorNome).toBe("João");
    expect(result.linhas[1]!.valorTotal).toBeCloseTo(1500);
    expect(result.linhas[1]!.quantidade).toBe(2);
  });

  it("aplica filtro de período", async () => {
    const mockPrisma = {
      fatoPedido: {
        findMany: jest.fn().mockResolvedValue([{ vendedorNome: "Ana", vrNf: "100.00" }]),
      },
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    await queryPedidosPorVendedor(mockPrisma, {
      periodoDe: "2024-01-01",
      periodoAte: "2024-01-31",
    });

    const call = (mockPrisma.fatoPedido.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.dataOrcamento?.gte).toEqual(new Date("2024-01-01T00:00:00"));
  });
});

describe("queryPedidosAtrasados", () => {
  // implementado em B.8
});

describe("queryParcelasAVencer", () => {
  // implementado em B.9
});
