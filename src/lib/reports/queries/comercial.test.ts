// src/lib/reports/queries/comercial.test.ts
import {
  queryPedidosPeriodo,
  queryPedidosPorEtapa,
  queryPedidosPorVendedor,
  queryPedidosAtrasados,
  queryParcelasAVencer,
  queryContarPedidos,
  queryDemandaEmAberta,
  queryDemandaPorProduto,
  queryEstoqueDisponivel,
  querySeriaisProduto,
  queryPedidoSituacao,
} from "./comercial";
import { corteAtualDate } from "@/lib/corte-dados";

// Data de início das análises vigente no processo de teste (ninguém chamou
// getCorteDados, então vale o padrão): 2026-03-16.
const CORTE = corteAtualDate();

/** Valores interpolados num $queryRaw (o mock recebe [strings, ...values]). */
function valoresDoRaw(mock: jest.Mock, chamada = 0): unknown[] {
  return mock.mock.calls[chamada]!.slice(1);
}
/** Texto do SQL de um $queryRaw. */
function sqlDoRaw(mock: jest.Mock, chamada = 0): string {
  return (mock.mock.calls[chamada]![0] as string[]).join("?");
}

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

  it("CORTE: sem período, o piso é a data de início das análises (não varre o histórico)", async () => {
    const mockPrisma = {
      fatoPedido: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    await queryPedidosPeriodo(mockPrisma, {});
    const call = (mockPrisma.fatoPedido.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.dataOrcamento?.gte).toEqual(CORTE);
  });

  it("CORTE: período que começa antes do corte é grampeado no corte", async () => {
    const mockPrisma = {
      fatoPedido: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    await queryPedidosPeriodo(mockPrisma, { periodoDe: "2024-01-01", periodoAte: "2026-04-30" });
    const call = (mockPrisma.fatoPedido.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.dataOrcamento?.gte).toEqual(CORTE);
    expect(call.where?.dataOrcamento?.gte).not.toEqual(new Date("2024-01-01T00:00:00Z"));
  });

  it("aplica filtro de período quando ambos presentes (borda final exclusiva)", async () => {
    const mockPrisma = {
      fatoPedido: {
        findMany: jest.fn().mockResolvedValue([{ vrProdutos: "200.00" }]),
      },
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    const result = await queryPedidosPeriodo(mockPrisma, {
      periodoDe: "2026-04-01",
      periodoAte: "2026-04-30",
    });
    expect(result.totalPedidos).toBe(1);
    expect(result.valorTotal).toBeCloseTo(200);

    const call = (mockPrisma.fatoPedido.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.dataOrcamento?.gte).toEqual(new Date("2026-04-01T00:00:00Z"));
    // lt = ate + 1 dia: o dia 30/04 entra inteiro
    expect(call.where?.dataOrcamento?.lt).toEqual(new Date("2026-05-01T00:00:00Z"));
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

  it("CORTE: o funil por etapa tem piso na data de início das análises", async () => {
    const mockPrisma = {
      fatoPedido: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    await queryPedidosPorEtapa(mockPrisma);
    const call = (mockPrisma.fatoPedido.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.dataOrcamento?.gte).toEqual(CORTE);
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
      periodoDe: "2026-04-01",
      periodoAte: "2026-04-30",
    });

    const call = (mockPrisma.fatoPedido.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.dataOrcamento?.gte).toEqual(new Date("2026-04-01T00:00:00Z"));
    expect(call.where?.dataOrcamento?.lt).toEqual(new Date("2026-05-01T00:00:00Z"));
  });

  it("CORTE: sem período, o ranking de vendedor tem piso no corte", async () => {
    const mockPrisma = {
      fatoPedido: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    await queryPedidosPorVendedor(mockPrisma, {});
    const call = (mockPrisma.fatoPedido.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.dataOrcamento?.gte).toEqual(CORTE);
  });

  it("CORTE: período pré-corte é grampeado no ranking de vendedor", async () => {
    const mockPrisma = {
      fatoPedido: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    await queryPedidosPorVendedor(mockPrisma, { periodoDe: "2025-01-01", periodoAte: "2026-06-30" });
    const call = (mockPrisma.fatoPedido.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.dataOrcamento?.gte).toEqual(CORTE);
  });
});

describe("queryPedidosAtrasados", () => {
  it("retorna parcelas vencidas não faturadas com diasAtraso calculado", async () => {
    const hoje = new Date("2024-03-10T00:00:00");
    const mockPrisma = {
      // Piso do corte: as parcelas so entram se o pedido pai estiver na janela.
      fatoPedido: { findMany: jest.fn().mockResolvedValue([{ odooId: 1 }, { odooId: 2 }]) },
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
        count: jest.fn().mockResolvedValue(2),
        aggregate: jest.fn().mockResolvedValue({ _sum: { valor: 300 } }),
        findFirst: jest.fn().mockResolvedValue({ dataVencimento: new Date("2024-03-01T00:00:00") }),
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
      // Piso do corte: as parcelas so entram se o pedido pai estiver na janela.
      fatoPedido: { findMany: jest.fn().mockResolvedValue([{ odooId: 1 }, { odooId: 2 }]) },
      fatoPedidoParcela: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { valor: null } }),
        findFirst: jest.fn().mockResolvedValue(null),
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
      // Piso do corte: as parcelas so entram se o pedido pai estiver na janela.
      fatoPedido: { findMany: jest.fn().mockResolvedValue([{ odooId: 1 }, { odooId: 2 }]) },
      fatoPedidoParcela: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { valor: null } }),
        findFirst: jest.fn().mockResolvedValue(null),
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
      // Piso do corte: as parcelas so entram se o pedido pai estiver na janela.
      fatoPedido: { findMany: jest.fn().mockResolvedValue([{ odooId: 1 }, { odooId: 2 }]) },
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
        count: jest.fn().mockResolvedValue(2),
        aggregate: jest.fn().mockResolvedValue({ _sum: { valor: 450 } }),
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
      // Piso do corte: as parcelas so entram se o pedido pai estiver na janela.
      fatoPedido: { findMany: jest.fn().mockResolvedValue([{ odooId: 1 }, { odooId: 2 }]) },
      fatoPedidoParcela: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { valor: null } }),
        findFirst: jest.fn().mockResolvedValue(null),
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
      // Piso do corte: as parcelas so entram se o pedido pai estiver na janela.
      fatoPedido: { findMany: jest.fn().mockResolvedValue([{ odooId: 1 }, { odooId: 2 }]) },
      fatoPedidoParcela: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { valor: null } }),
        findFirst: jest.fn().mockResolvedValue(null),
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
      // Piso do corte: as parcelas so entram se o pedido pai estiver na janela.
      fatoPedido: { findMany: jest.fn().mockResolvedValue([{ odooId: 1 }, { odooId: 2 }]) },
      fatoPedidoParcela: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { valor: null } }),
        findFirst: jest.fn().mockResolvedValue(null),
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

  it("CORTE: conta apenas pedidos dentro da janela de análise", async () => {
    const mockPrisma = {
      fatoPedido: { count: jest.fn().mockResolvedValue(0) },
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    await queryContarPedidos(mockPrisma);
    const call = (mockPrisma.fatoPedido.count as jest.Mock).mock.calls[0][0];
    expect(call.where?.dataOrcamento?.gte).toEqual(CORTE);
  });

  it("CORTE: período pré-corte é grampeado na contagem", async () => {
    const mockPrisma = {
      fatoPedido: { count: jest.fn().mockResolvedValue(0) },
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    await queryContarPedidos(mockPrisma, { periodoDe: "2013-01-01", periodoAte: "2026-12-31" });
    const call = (mockPrisma.fatoPedido.count as jest.Mock).mock.calls[0][0];
    expect(call.where?.dataOrcamento?.gte).toEqual(CORTE);
  });
});

describe("CORTE , piso da data de início das análises nas consultas de pedido", () => {
  it("queryPedidosAtrasados: restringe as parcelas aos pedidos dentro da janela", async () => {
    const mockPrisma = {
      fatoPedido: { findMany: jest.fn().mockResolvedValue([{ odooId: 7 }, { odooId: 9 }]) },
      fatoPedidoParcela: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { valor: null } }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    await queryPedidosAtrasados(mockPrisma, new Date("2026-06-10T00:00:00"));

    // O universo de pedidos veio filtrado pelo corte...
    const pedidoCall = (mockPrisma.fatoPedido.findMany as jest.Mock).mock.calls[0][0];
    expect(pedidoCall.where?.dataOrcamento?.gte).toEqual(CORTE);
    // ...e a parcela só entra se o pedido pai estiver nesse universo.
    const parcelaCall = (mockPrisma.fatoPedidoParcela.findMany as jest.Mock).mock.calls[0][0];
    expect(parcelaCall.where?.pedidoId).toEqual({ in: [7, 9] });
  });

  it("queryParcelasAVencer: restringe as parcelas aos pedidos dentro da janela", async () => {
    const mockPrisma = {
      fatoPedido: { findMany: jest.fn().mockResolvedValue([{ odooId: 7 }]) },
      fatoPedidoParcela: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { valor: null } }),
      },
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    await queryParcelasAVencer(mockPrisma, {}, new Date("2026-06-10T00:00:00"));

    const pedidoCall = (mockPrisma.fatoPedido.findMany as jest.Mock).mock.calls[0][0];
    expect(pedidoCall.where?.dataOrcamento?.gte).toEqual(CORTE);
    const parcelaCall = (mockPrisma.fatoPedidoParcela.findMany as jest.Mock).mock.calls[0][0];
    expect(parcelaCall.where?.pedidoId).toEqual({ in: [7] });
  });

  // O job de atendimento nunca rodou nestes mocks: as consultas caem na quantidade cheia,
  // uniformemente, que e exatamente o contrato (nunca misturar as duas bases).
  const semAtendimento = () => ({
    fatoBuildState: { findUnique: jest.fn().mockResolvedValue(null) },
  });

  it("queryDemandaEmAberta: o SQL tem piso em data_orcamento >= corte", async () => {
    const raw = jest.fn().mockResolvedValue([]);
    const mockPrisma = {
      ...semAtendimento(),
      $queryRaw: raw,
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    await queryDemandaEmAberta(mockPrisma, {});
    expect(sqlDoRaw(raw)).toContain("f.data_orcamento >=");
    expect(valoresDoRaw(raw)).toContainEqual(CORTE);
  });

  it("queryDemandaPorProduto: o JOIN com o pedido tem piso de data", async () => {
    const raw = jest.fn().mockResolvedValue([]);
    const mockPrisma = {
      ...semAtendimento(),
      $queryRaw: raw,
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    await queryDemandaPorProduto(mockPrisma, {});
    expect(sqlDoRaw(raw)).toContain("f.data_orcamento >=");
    expect(valoresDoRaw(raw)).toContainEqual(CORTE);
  });

  it("queryEstoqueDisponivel: piso na demanda; o saldo, que é foto, fica sem filtro de data", async () => {
    const raw = jest.fn().mockResolvedValue([]);
    const saldoFindMany = jest.fn().mockResolvedValue([]);
    const mockPrisma = {
      ...semAtendimento(),
      fatoEstoqueLocal: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      fatoEstoqueSaldo: { findMany: saldoFindMany },
      $queryRaw: raw,
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    await queryEstoqueDisponivel(mockPrisma, {});
    // A demanda (documento com data) respeita o piso...
    expect(sqlDoRaw(raw)).toContain("f.data_orcamento >=");
    expect(valoresDoRaw(raw)).toContainEqual(CORTE);
    // ...e o saldo, que e foto do estoque de hoje, nao leva recorte de data nenhum.
    expect(saldoFindMany.mock.calls[0][0].where).not.toHaveProperty("dataOrcamento");
  });

  it("querySeriaisProduto: lê fato_serial_saldo, só o que tem saldo e local (foto, sem corte)", async () => {
    const raw = jest.fn().mockResolvedValue([]);
    const mockPrisma = { $queryRaw: raw } as unknown as import("@/generated/prisma/client").PrismaClient;

    await querySeriaisProduto(mockPrisma, {});
    const sql = sqlDoRaw(raw);
    expect(sql).toContain("FROM fato_serial_saldo");
    expect(sql).toContain("s.saldo > 0");
    expect(sql).toContain("s.local_id IS NOT NULL");
    // Serial em estoque e foto: a data de inicio das analises nao entra aqui.
    expect(valoresDoRaw(raw)).not.toContainEqual(CORTE);
  });

  it("queryPedidoSituacao: pedido anterior ao corte não é devolvido (foraDaJanela)", async () => {
    const mockPrisma = {
      fatoPedido: {
        findFirst: jest.fn().mockResolvedValue({
          odooId: 1,
          numero: "PV-0001/24",
          dataOrcamento: new Date("2024-05-10T00:00:00Z"),
        }),
      },
      fatoPedidoHistorico: { findMany: jest.fn() },
      $queryRaw: jest.fn(),
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    const r = await queryPedidoSituacao(mockPrisma, { numero: "PV-0001/24" });
    expect(r.encontrado).toBe(false);
    expect(r.foraDaJanela).toBe(true);
    expect(r.pedido).toBeNull();
    // Nem sequer foi buscar a trilha/itens do pedido fora da janela.
    expect(mockPrisma.fatoPedidoHistorico.findMany).not.toHaveBeenCalled();
  });

  it("queryPedidoSituacao: pedido dentro da janela é devolvido normalmente", async () => {
    const mockPrisma = {
      fatoPedido: {
        findFirst: jest.fn().mockResolvedValue({
          odooId: 1,
          numero: "PV-2037/26",
          etapaId: 3,
          etapaNome: "Separação",
          bucketDemanda: "ABERTA",
          categoriaOperacao: "venda",
          operacaoNome: "Venda",
          modalidadeFrete: "0",
          empresaNome: "Matrix",
          participanteNome: "Cliente A",
          vendedorNome: "Ana",
          vrProdutos: "1000.00",
          dataOrcamento: new Date("2026-04-02T00:00:00Z"),
          dataAprovacao: new Date("2026-04-03T00:00:00Z"),
          dataPrevista: null,
          pendenciaEtapa: null,
        }),
      },
      fatoPedidoHistorico: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    } as unknown as import("@/generated/prisma/client").PrismaClient;

    const r = await queryPedidoSituacao(mockPrisma, { numero: "PV-2037/26" });
    expect(r.encontrado).toBe(true);
    expect(r.foraDaJanela).toBe(false);
    expect(r.pedido?.numero).toBe("PV-2037/26");
    // modalidade de frete traduzida do código NF-e (0 -> CIF)
    expect(r.pedido?.modalidadeFrete).toBe("CIF (remetente)");
  });
});
