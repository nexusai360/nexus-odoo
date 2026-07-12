// src/lib/reports/queries/pedido-historico.ts
//
// Núcleo de consulta do histórico de etapas do pedido (fato_pedido_historico),
// framework-neutro. Sem estado/freshness/shaping (vivem no handler MCP).
// Fonte: fato_pedido_historico (1 linha = 1 mudança de etapa).

import type { PrismaClient } from "@/generated/prisma/client";
import { corteAtualDate } from "@/lib/corte-dados";

// fato_pedido_historico é HISTÓRICO puro (1 linha = 1 transição de etapa, com data):
// toda leitura respeita a data de início das análises (AppSetting sync.corte_dados).
// Evento anterior ao corte não é considerado , senão um pedido antigo vira "travado há
// centenas de dias" e domina o ranking. Nada é apagado: é filtro de leitura.

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
    // Piso da janela de análise: a trilha começa na data de início das análises.
    where: { pedidoId: filtros.pedidoId, dataEntrada: { gte: corteAtualDate() } },
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
  filtros: { diasMin?: number; limit?: number; offset?: number; agora?: Date },
): Promise<{
  linhas: { pedidoId: number | null; etapaNome: string | null; dataEntrada: string | null; diasParado: number }[];
  totalTravados: number;
  diasMin: number;
}> {
  const diasMin = filtros.diasMin ?? 30;
  const agora = filtros.agora ?? new Date();
  // Só pedidos de VENDA (exclui transferência/remessa/anomalia): "travado" faz
  // sentido para pedido comercial, não para movimento intragrupo. Ver perícia 08.
  // Piso da janela de análise em DUAS pontas: o pedido (documento com data) e o evento
  // de etapa (histórico com data). Sem isso, pedido pré-corte encabeça a lista de
  // travados com centenas de dias parados.
  const vendaIds = new Set(
    (
      await prisma.fatoPedido.findMany({
        where: { categoriaOperacao: "venda", dataOrcamento: { gte: corteAtualDate() } },
        select: { odooId: true },
      })
    ).map((p) => p.odooId),
  );
  const rows = await prisma.fatoPedidoHistorico.findMany({
    where: { dataEntrada: { gte: corteAtualDate() } },
    select: { pedidoId: true, etapaNome: true, dataEntrada: true },
  });

  // Último evento por pedido (maior dataEntrada).
  const ultimo = new Map<number, { etapaNome: string | null; dataEntrada: Date | null }>();
  for (const r of rows) {
    if (r.pedidoId == null || r.dataEntrada == null) continue;
    if (!vendaIds.has(r.pedidoId)) continue;
    const ex = ultimo.get(r.pedidoId);
    if (!ex || (ex.dataEntrada && r.dataEntrada > ex.dataEntrada)) {
      ultimo.set(r.pedidoId, { etapaNome: r.etapaNome, dataEntrada: r.dataEntrada });
    }
  }

  const MS_DIA = 86_400_000;
  // Alavanca 2b , EXCECAO de paginacao em memoria: a lista nasce de uma
  // agregacao em memoria (ultimo evento por pedido), entao nao da para usar
  // take/skip no SQL. Ordenamos de forma ESTAVEL (diasParado desc + desempate
  // por pedidoId asc) e fatiamos [offset, offset+limit). total = conjunto todo.
  const todos = [...ultimo.entries()]
    .map(([pedidoId, v]) => ({
      pedidoId,
      etapaNome: v.etapaNome,
      dataEntrada: v.dataEntrada ? v.dataEntrada.toISOString().slice(0, 10) : null,
      diasParado: v.dataEntrada ? Math.floor((agora.getTime() - v.dataEntrada.getTime()) / MS_DIA) : 0,
    }))
    .filter((l) => l.diasParado > diasMin)
    .sort((a, b) => b.diasParado - a.diasParado || (a.pedidoId ?? 0) - (b.pedidoId ?? 0));

  const offset = filtros.offset ?? 0;
  const limit = filtros.limit ?? 50;
  return {
    linhas: todos.slice(offset, offset + limit),
    totalTravados: todos.length,
    diasMin,
  };
}
