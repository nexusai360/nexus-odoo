// src/lib/reports/queries/comercial.test.ts
import {
  queryPedidosPeriodo,
  queryPedidosPorEtapa,
  queryPedidosPorVendedor,
  queryPedidosAtrasados,
  queryParcelasAVencer,
  queryContarPedidos,
} from "./comercial";

// Mocks são definidos por cada describe conforme necessário
describe("queryPedidosPeriodo", () => {
  it("retorna totalPedidos e valorTotal sem filtro", async () => {
    const mockPrisma = {
      fatoPedido: {
        findMany: jest.fn().mockResolvedValue([
          { vrProdutos: "1000.00" },
          { vrProdutos: "500.00" },
        ]),
      },
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    const result = await queryPedidosPeriodo(mockPrisma, {});
    expect(result.totalPedidos).toBe(2);
    expect(result.valorTotal).toBeCloseTo(1500);
  });

  it("aplica filtro de período quando ambos presentes", async () => {
    const mockPrisma = {
      fatoPedido: {
        findMany: jest.fn().mockResolvedValue([{ vrProdutos: "200.00" }]),
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

    const result = await queryPedidosPeriodo(mockPrisma, {}); // vrProdutos: nenhum registro
    expect(result.totalPedidos).toBe(0);
    expect(result.valorTotal).toBe(0);
  });
});

describe("queryPedidosPorEtapa", () => {
  it("agrupa por etapaNome e retorna linhas com quantidade e valorTotal (usa vrProdutos)", async () => {
    const mockPrisma = {
      fatoPedido: {
        findMany: jest.fn().mockResolvedValue([
          { etapaNome: "Concluído", etapaFinaliza: true, vrProdutos: "1000.00" },
          { etapaNome: "Concluído", etapaFinaliza: true, vrProdutos: "500.00" },
          { etapaNome: "Em Aberto", etapaFinaliza: false, vrProdutos: "200.00" },
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
  it("agrupa por vendedorNome e retorna ordenado por valorTotal desc (usa vrProdutos)", async () => {
    const mockPrisma = {
      fatoPedido: {
        findMany: jest.fn().mockResolvedValue([
          { vendedorNome: "João", vrProdutos: "1000.00" },
          { vendedorNome: "Maria", vrProdutos: "3000.00" },
          { vendedorNome: "João", vrProdutos: "500.00" },
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
        findMany: jest.fn().mockResolvedValue([{ vendedorNome: "Ana", vrProdutos: "100.00" }]),
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
  it("retorna parcelas vencidas não faturadas com diasAtraso calculado", async () => {
    const hoje = new Date("2024-03-10T00:00:00");
    const mockPrisma = {
      fatoPedidoParcela: {
        findMany: jest.fn().mockResolvedValue([
          {
            pedidoId: 1,
            participanteNome: "Cliente A",
            numero: "1/1",
            dataVencimento: new Date("2024-03-01T00:00:00"),
            valor: "200.00",
            parcelaFaturada: false,
          },
          {
            pedidoId: 2,
            participanteNome: "Cliente B",
            numero: "2/1",
            dataVencimento: new Date("2024-03-05T00:00:00"),
            valor: "100.00",
            parcelaFaturada: false,
          },
        ]),
      },
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    const result = await queryPedidosAtrasados(mockPrisma, hoje);
    expect(result.linhas).toHaveLength(2);
    expect(result.linhas[0]!.diasAtraso).toBe(9);  // 10 - 1 março = 9 dias
    expect(result.linhas[1]!.diasAtraso).toBe(5);  // 10 - 5 março = 5 dias
    expect(result.totalAtrasado).toBeCloseTo(300);
  });

  it("usa where com dataVencimento < início do dia e parcelaFaturada=false (C1: normaliza hoje)", async () => {
    // hoje com hora corrente , o where deve usar o início do dia, não a hora corrente
    const hoje = new Date("2024-03-10T14:35:22.123Z");
    const mockPrisma = {
      fatoPedidoParcela: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    await queryPedidosAtrasados(mockPrisma, hoje);
    const call = (mockPrisma.fatoPedidoParcela.findMany as jest.Mock).mock.calls[0][0];
    const ltUsado = call.where?.dataVencimento?.lt as Date;
    // deve ser início do dia (hora zerada), não a hora corrente
    expect(ltUsado.getHours()).toBe(0);
    expect(ltUsado.getMinutes()).toBe(0);
    expect(ltUsado.getSeconds()).toBe(0);
    expect(ltUsado.getMilliseconds()).toBe(0);
    expect(call.where?.parcelaFaturada).toBe(false);
  });

  it("C1 borda: parcela que vence hoje (T00:00:00) NÃO é considerada atrasada", async () => {
    // hoje com hora corrente , se a query não normalizar, parcela T00:00:00 aparece como lt=hoje
    const hojeComHora = new Date("2024-03-10T09:00:00");
    const mockPrisma = {
      fatoPedidoParcela: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    await queryPedidosAtrasados(mockPrisma, hojeComHora);
    const call = (mockPrisma.fatoPedidoParcela.findMany as jest.Mock).mock.calls[0][0];
    const ltUsado = call.where?.dataVencimento?.lt as Date;
    // início do dia de 2024-03-10 → parcela de 10/03 (T00:00:00) >= ltUsado, logo não inclusa
    expect(ltUsado).toEqual(new Date(2024, 2, 10)); // mês 0-based: 2 = março
  });
});

describe("queryParcelasAVencer", () => {
  it("retorna parcelas a vencer nos próximos N dias com totalAVencer", async () => {
    const hoje = new Date("2024-03-10T00:00:00");
    const mockPrisma = {
      fatoPedidoParcela: {
        findMany: jest.fn().mockResolvedValue([
          {
            pedidoId: 1,
            participanteNome: "Cliente A",
            numero: "1/1",
            dataVencimento: new Date("2024-03-15T00:00:00"),
            valor: "300.00",
          },
          {
            pedidoId: 2,
            participanteNome: "Cliente B",
            numero: "2/1",
            dataVencimento: new Date("2024-03-20T00:00:00"),
            valor: "150.00",
          },
        ]),
      },
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    const result = await queryParcelasAVencer(mockPrisma, { ateDias: 30 }, hoje);
    expect(result.linhas).toHaveLength(2);
    expect(result.totalAVencer).toBeCloseTo(450);
  });

  it("aplica filtro de dataVencimento gte início do dia e lte início+ateDias (C1: normaliza hoje)", async () => {
    // hoje com hora corrente , o gte deve ser início do dia para incluir parcelas de hoje
    const hoje = new Date("2024-03-10T09:00:00");
    const mockPrisma = {
      fatoPedidoParcela: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    await queryParcelasAVencer(mockPrisma, { ateDias: 15 }, hoje);
    const call = (mockPrisma.fatoPedidoParcela.findMany as jest.Mock).mock.calls[0][0];
    const gteUsado = call.where?.dataVencimento?.gte as Date;
    // deve ser início do dia (hora zerada)
    expect(gteUsado.getHours()).toBe(0);
    expect(gteUsado.getMinutes()).toBe(0);
    expect(gteUsado.getSeconds()).toBe(0);
    // 10 março + 15 dias = 25 março
    expect(call.where?.dataVencimento?.lte).toEqual(new Date("2024-03-25T00:00:00"));
    expect(call.where?.parcelaFaturada).toBe(false);
  });

  it("C1 borda: parcela que vence hoje (T00:00:00) É incluída em a vencer", async () => {
    const hojeComHora = new Date("2024-03-10T09:00:00");
    const mockPrisma = {
      fatoPedidoParcela: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    await queryParcelasAVencer(mockPrisma, { ateDias: 15 }, hojeComHora);
    const call = (mockPrisma.fatoPedidoParcela.findMany as jest.Mock).mock.calls[0][0];
    const gteUsado = call.where?.dataVencimento?.gte as Date;
    // início do dia de 10/03 → parcela T00:00:00 de 10/03 satisfaz >= gteUsado
    expect(gteUsado).toEqual(new Date(2024, 2, 10)); // 0-based: 2 = março
  });

  it("usa ateDias=30 como default", async () => {
    const hoje = new Date("2024-03-10T00:00:00");
    const mockPrisma = {
      fatoPedidoParcela: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    await queryParcelasAVencer(mockPrisma, {}, hoje);
    const call = (mockPrisma.fatoPedidoParcela.findMany as jest.Mock).mock.calls[0][0];
    const gte = call.where?.dataVencimento?.gte as Date;
    const lte = call.where?.dataVencimento?.lte as Date;
    const diff = (lte.getTime() - gte.getTime()) / (1000 * 60 * 60 * 24);
    expect(diff).toBe(30);
  });
});

describe("queryContarPedidos", () => {
  it("retorna o total de pedidos via count", async () => {
    const mockPrisma = {
      fatoPedido: {
        count: jest.fn().mockResolvedValue(71),
      },
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    const result = await queryContarPedidos(mockPrisma);
    expect(result.total).toBe(71);
    expect(mockPrisma.fatoPedido.count).toHaveBeenCalledTimes(1);
  });
});
