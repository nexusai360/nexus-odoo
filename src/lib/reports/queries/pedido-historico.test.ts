import { queryPedidoHistoricoEtapas, queryPedidoTravadosPorEtapa } from "./pedido-historico";
import type { PrismaClient } from "@/generated/prisma/client";
import { corteAtualDate } from "@/lib/corte-dados";

// Data de início das análises vigente no processo de teste (padrão 2026-03-16).
const CORTE = corteAtualDate();

function mkPrisma(rows: unknown[]): PrismaClient {
  // Por padrão, todos os pedidos das linhas contam como VENDA (queryPedidoTravadosPorEtapa
  // filtra por categoria_operacao='venda' via fatoPedido.findMany).
  const vendaIds = [
    ...new Set((rows as { pedidoId?: number | null }[]).map((r) => r.pedidoId).filter((x): x is number => x != null)),
  ].map((odooId) => ({ odooId }));
  return {
    fatoPedidoHistorico: { findMany: jest.fn().mockResolvedValue(rows) },
    fatoPedido: { findMany: jest.fn().mockResolvedValue(vendaIds) },
  } as unknown as PrismaClient;
}

describe("queryPedidoHistoricoEtapas", () => {
  it("agrega tempo por etapa e soma total", async () => {
    const p = mkPrisma([
      { etapaId: 1, etapaNome: "A", etapaTipo: "venda", dataEntrada: new Date("2026-04-01"), tempoEtapaDias: 3 },
      { etapaId: 2, etapaNome: "B", etapaTipo: "venda", dataEntrada: new Date("2026-04-04"), tempoEtapaDias: 2 },
      { etapaId: 1, etapaNome: "A", etapaTipo: "venda", dataEntrada: new Date("2026-04-06"), tempoEtapaDias: 4 },
    ]);
    const r = await queryPedidoHistoricoEtapas(p, { pedidoId: 821 });
    expect(r.totalEventos).toBe(3);
    expect(r.tempoTotalDias).toBe(9);
    // etapa 1 acumula 3+4=7 (mais que etapa 2=2), vem primeiro
    expect(r.porEtapa[0]).toEqual({ etapaId: 1, etapaNome: "A", tempoTotalDias: 7, passagens: 2 });
  });

  it("CORTE: a trilha começa na data de início das análises (piso em dataEntrada)", async () => {
    const p = mkPrisma([]);
    await queryPedidoHistoricoEtapas(p, { pedidoId: 821 });
    const call = (p.fatoPedidoHistorico.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where?.pedidoId).toBe(821);
    expect(call.where?.dataEntrada?.gte).toEqual(CORTE);
  });
});

describe("queryPedidoTravadosPorEtapa", () => {
  it("pega o ultimo evento por pedido e filtra > diasMin", async () => {
    const agora = new Date("2026-07-01T00:00:00Z");
    const p = mkPrisma([
      // pedido 1: ultimo evento 2026-06-25 (6 dias parado) -> nao passa diasMin=30
      { pedidoId: 1, etapaNome: "X", dataEntrada: new Date("2026-06-20T00:00:00Z") },
      { pedidoId: 1, etapaNome: "Y", dataEntrada: new Date("2026-06-25T00:00:00Z") },
      // pedido 2: ultimo evento 2026-04-01 (~91 dias) -> passa
      { pedidoId: 2, etapaNome: "Z", dataEntrada: new Date("2026-04-01T00:00:00Z") },
    ]);
    const r = await queryPedidoTravadosPorEtapa(p, { diasMin: 30, agora });
    expect(r.totalTravados).toBe(1);
    expect(r.linhas[0].pedidoId).toBe(2);
    expect(r.linhas[0].diasParado).toBeGreaterThan(30);
  });

  it("ignora pedidos sem data", async () => {
    const p = mkPrisma([{ pedidoId: 3, etapaNome: "W", dataEntrada: null }]);
    const r = await queryPedidoTravadosPorEtapa(p, { diasMin: 1, agora: new Date("2026-07-01") });
    expect(r.totalTravados).toBe(0);
  });

  it("exclui pedidos que não são de venda (categoria_operacao != 'venda')", async () => {
    const agora = new Date("2026-07-01T00:00:00Z");
    const p = {
      fatoPedidoHistorico: {
        findMany: jest.fn().mockResolvedValue([
          { pedidoId: 2, etapaNome: "Z", dataEntrada: new Date("2026-04-01T00:00:00Z") }, // 91 dias
        ]),
      },
      // pedido 2 NÃO está na lista de venda -> deve sumir do resultado.
      fatoPedido: { findMany: jest.fn().mockResolvedValue([{ odooId: 99 }]) },
    } as unknown as PrismaClient;
    const r = await queryPedidoTravadosPorEtapa(p, { diasMin: 30, agora });
    expect(r.totalTravados).toBe(0);
  });

  it("CORTE: pedido e evento anteriores à data de início das análises ficam fora", async () => {
    const agora = new Date("2026-07-01T00:00:00Z");
    const p = mkPrisma([]);
    await queryPedidoTravadosPorEtapa(p, { diasMin: 30, agora });

    // O universo de pedidos de venda já vem com piso no corte...
    const pedidoCall = (p.fatoPedido.findMany as jest.Mock).mock.calls[0][0];
    expect(pedidoCall.where?.categoriaOperacao).toBe("venda");
    expect(pedidoCall.where?.dataOrcamento?.gte).toEqual(CORTE);
    // ...e o log de etapas também (evento pré-corte não vira "travado há N dias").
    const histCall = (p.fatoPedidoHistorico.findMany as jest.Mock).mock.calls[0][0];
    expect(histCall.where?.dataEntrada?.gte).toEqual(CORTE);
  });
});
