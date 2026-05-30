// src/lib/reports/queries/pedido-historico.ts
//
// Núcleo de consulta do histórico de etapas do pedido (fato_pedido_historico),
// framework-neutro. Sem estado/freshness/shaping (vivem no handler MCP).
// Fonte: fato_pedido_historico (1 linha = 1 mudança de etapa).

import type { PrismaClient } from "@/generated/prisma/client";

export interface EventoEtapa {
  etapaId: number | null;
  etapaNome: string | null;
  etapaTipo: string | null;
  dataEntrada: string | null;
  tempoEtapaDias: number;
}

/** Histórico de etapas de UM pedido: log cru (ordenado) + agregado por etapa. */
export async function queryPedidoHistoricoEtapas(
  prisma: PrismaClient,
  filtros: { pedidoId: number },
): Promise<{
  pedidoId: number;
  eventos: EventoEtapa[];
  porEtapa: { etapaId: number | null; etapaNome: string | null; tempoTotalDias: number; passagens: number }[];
  totalEventos: number;
  tempoTotalDias: number;
}> {
  const rows = await prisma.fatoPedidoHistorico.findMany({
    where: { pedidoId: filtros.pedidoId },
    select: { etapaId: true, etapaNome: true, etapaTipo: true, dataEntrada: true, tempoEtapaDias: true },
    orderBy: [{ dataEntrada: "asc" }, { odooId: "asc" }],
  });

  const eventos: EventoEtapa[] = rows.map((r) => ({
    etapaId: r.etapaId,
    etapaNome: r.etapaNome,
    etapaTipo: r.etapaTipo,
    dataEntrada: r.dataEntrada ? r.dataEntrada.toISOString().slice(0, 10) : null,
    tempoEtapaDias: r.tempoEtapaDias,
  }));

  const map = new Map<number | null, { etapaId: number | null; etapaNome: string | null; tempoTotalDias: number; passagens: number }>();
  let tempoTotalDias = 0;
  for (const r of rows) {
    tempoTotalDias += r.tempoEtapaDias;
    const ex = map.get(r.etapaId);
    if (ex) {
      ex.tempoTotalDias += r.tempoEtapaDias;
      ex.passagens += 1;
    } else {
      map.set(r.etapaId, {
        etapaId: r.etapaId,
        etapaNome: r.etapaNome,
        tempoTotalDias: r.tempoEtapaDias,
        passagens: 1,
      });
    }
  }
  const porEtapa = [...map.values()].sort((a, b) => b.tempoTotalDias - a.tempoTotalDias);

  return { pedidoId: filtros.pedidoId, eventos, porEtapa, totalEventos: rows.length, tempoTotalDias };
}

/**
 * Pedidos parados no FLUXO de etapas (processo): o último evento de cada pedido
 * está há mais de `diasMin` dias sem avançar. Critério de PROCESSO, não financeiro.
 * @param agora instante de referência (injetável para teste determinístico).
 */
export async function queryPedidoTravadosPorEtapa(
  prisma: PrismaClient,
  filtros: { diasMin?: number; limite?: number; agora?: Date },
): Promise<{
  linhas: { pedidoId: number | null; etapaNome: string | null; dataEntrada: string | null; diasParado: number }[];
  totalTravados: number;
  diasMin: number;
}> {
  const diasMin = filtros.diasMin ?? 30;
  const agora = filtros.agora ?? new Date();
  const rows = await prisma.fatoPedidoHistorico.findMany({
    select: { pedidoId: true, etapaNome: true, dataEntrada: true },
  });

  // Último evento por pedido (maior dataEntrada).
  const ultimo = new Map<number, { etapaNome: string | null; dataEntrada: Date | null }>();
  for (const r of rows) {
    if (r.pedidoId == null || r.dataEntrada == null) continue;
    const ex = ultimo.get(r.pedidoId);
    if (!ex || (ex.dataEntrada && r.dataEntrada > ex.dataEntrada)) {
      ultimo.set(r.pedidoId, { etapaNome: r.etapaNome, dataEntrada: r.dataEntrada });
    }
  }

  const MS_DIA = 86_400_000;
  const linhas = [...ultimo.entries()]
    .map(([pedidoId, v]) => ({
      pedidoId,
      etapaNome: v.etapaNome,
      dataEntrada: v.dataEntrada ? v.dataEntrada.toISOString().slice(0, 10) : null,
      diasParado: v.dataEntrada ? Math.floor((agora.getTime() - v.dataEntrada.getTime()) / MS_DIA) : 0,
    }))
    .filter((l) => l.diasParado > diasMin)
    .sort((a, b) => b.diasParado - a.diasParado);

  return {
    linhas: linhas.slice(0, filtros.limite ?? 50),
    totalTravados: linhas.length,
    diasMin,
  };
}
