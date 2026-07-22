// src/lib/reports/queries/pedido-valor-historico.ts
//
// Nucleo de consulta do historico de VALORES do pedido (fato_pedido_valor_historico),
// framework-neutro. Uma linha = uma mudanca do nucleo (etapa, saldo a atender, margem, desconto,
// CBS, IBS); os demais valores vem snapshotados junto. evento='baixa' quando o pedido saiu do
// escopo. Nao recalcula nada: os valores vem prontos do Odoo, ja gravados pelo builder.
import type { PrismaClient } from "@/generated/prisma/client";

export interface PontoEvolucaoPedido {
  capturadoEm: string;
  evento: string;
  etapaId: number | null;
  etapaNome: string | null;
  saldoAtenderVenda: string | null;
  saldoAtenderCusto: string | null;
  alMargem: string | null;
  vrDesconto: string | null;
  vrOperacaoTributacao: string | null;
  vrCbs: string | null;
  vrIbs: string | null;
}

/** Serie temporal de UM pedido: todos os pontos (mudancas) em ordem cronologica. */
export async function queryEvolucaoPedido(
  prisma: PrismaClient,
  filtros: { pedidoId: number },
): Promise<{ pedidoId: number; pontos: PontoEvolucaoPedido[]; totalPontos: number }> {
  const rows = await prisma.fatoPedidoValorHistorico.findMany({
    where: { pedidoId: filtros.pedidoId },
    orderBy: { capturadoEm: "asc" },
    select: {
      capturadoEm: true,
      evento: true,
      etapaId: true,
      etapaNome: true,
      saldoAtenderVenda: true,
      saldoAtenderCusto: true,
      alMargem: true,
      vrDesconto: true,
      vrOperacaoTributacao: true,
      vrCbs: true,
      vrIbs: true,
    },
  });

  const s = (v: unknown): string | null => (v == null ? null : v.toString());
  const pontos: PontoEvolucaoPedido[] = rows.map((r) => ({
    capturadoEm: r.capturadoEm.toISOString(),
    evento: r.evento,
    etapaId: r.etapaId,
    etapaNome: r.etapaNome,
    saldoAtenderVenda: s(r.saldoAtenderVenda),
    saldoAtenderCusto: s(r.saldoAtenderCusto),
    alMargem: s(r.alMargem),
    vrDesconto: s(r.vrDesconto),
    vrOperacaoTributacao: s(r.vrOperacaoTributacao),
    vrCbs: s(r.vrCbs),
    vrIbs: s(r.vrIbs),
  }));

  return { pedidoId: filtros.pedidoId, pontos, totalPontos: pontos.length };
}
