import { queryPedidoHistoricoEtapas, queryPedidoTravadosPorEtapa } from "./pedido-historico";
import type { PrismaClient } from "@/generated/prisma/client";

function mkPrisma(rows: unknown[]): PrismaClient {
  return { fatoPedidoHistorico: { findMany: jest.fn().mockResolvedValue(rows) } } as unknown as PrismaClient;
}

describe("queryPedidoHistoricoEtapas", () => {
  it("agrega tempo por etapa e soma total", async () => {
    const p = mkPrisma([
      { etapaId: 1, etapaNome: "A", etapaTipo: "venda", dataEntrada: new Date("2026-01-01"), tempoEtapaDias: 3 },
      { etapaId: 2, etapaNome: "B", etapaTipo: "venda", dataEntrada: new Date("2026-01-04"), tempoEtapaDias: 2 },
      { etapaId: 1, etapaNome: "A", etapaTipo: "venda", dataEntrada: new Date("2026-01-06"), tempoEtapaDias: 4 },
    ]);
    const r = await queryPedidoHistoricoEtapas(p, { pedidoId: 821 });
    expect(r.totalEventos).toBe(3);
    expect(r.tempoTotalDias).toBe(9);
    // etapa 1 acumula 3+4=7 (mais que etapa 2=2), vem primeiro
    expect(r.porEtapa[0]).toEqual({ etapaId: 1, etapaNome: "A", tempoTotalDias: 7, passagens: 2 });
  });
});

describe("queryPedidoTravadosPorEtapa", () => {
  it("pega o ultimo evento por pedido e filtra > diasMin", async () => {
    const agora = new Date("2026-02-01T00:00:00Z");
    const p = mkPrisma([
      // pedido 1: ultimo evento 2026-01-25 (7 dias parado) -> nao passa diasMin=30
      { pedidoId: 1, etapaNome: "X", dataEntrada: new Date("2026-01-20T00:00:00Z") },
      { pedidoId: 1, etapaNome: "Y", dataEntrada: new Date("2026-01-25T00:00:00Z") },
      // pedido 2: ultimo evento 2025-12-01 (~62 dias) -> passa
      { pedidoId: 2, etapaNome: "Z", dataEntrada: new Date("2025-12-01T00:00:00Z") },
    ]);
    const r = await queryPedidoTravadosPorEtapa(p, { diasMin: 30, agora });
    expect(r.totalTravados).toBe(1);
    expect(r.linhas[0].pedidoId).toBe(2);
    expect(r.linhas[0].diasParado).toBeGreaterThan(30);
  });

  it("ignora pedidos sem data", async () => {
    const p = mkPrisma([{ pedidoId: 3, etapaNome: "W", dataEntrada: null }]);
    const r = await queryPedidoTravadosPorEtapa(p, { diasMin: 1, agora: new Date("2026-02-01") });
    expect(r.totalTravados).toBe(0);
  });
});
