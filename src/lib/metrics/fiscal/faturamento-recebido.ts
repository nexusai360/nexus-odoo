import type { Prisma, PrismaClient } from "../../../generated/prisma/client";
import type { FaturamentoInput } from "../_shared/types";
import { janelaClampada } from "@/lib/corte-dados";

export interface FaturamentoRecebidoResultado {
  disponivelPorPedido: boolean;
  disponivelPorNota: boolean;
  recebido: number;
  aReceber: number;
  pedidosComLancamento: number;
  gapNota: string;
}

/**
 * FATURAMENTO_RECEBIDO. O spike C0 provou no dado que a ponte
 * FatoPedidoParcela.finanLancamentoId esta MORTA (0 registros). O elo real e DIRETO:
 * FatoFinanceiroLancamentoItem.pedidoId (2227 itens, valores reais). Entao "recebido"
 * = SUM(vrPagoTotal) e "aReceber" = SUM(vrSaldo) dos itens de lancamento financeiro
 * ligados a um pedido. Corrige a SPEC 4.9, que apontava FatoFinanceiroTitulo (sem
 * lancamentoId/pedidoId). O eixo "recebido por NOTA individual" continua GAP honesto:
 * falta o elo nota->financeiro (notaId/chaveNfe no pedido), previsto para a Fase 2.
 * Filtro por empresa: via os pedidos da empresa (FatoPedido.empresaId).
 *
 * PERIODO: recorta por `dataDocumento` do lancamento (a data do documento financeiro, herdada
 * do lancamento pai). O cache nao guarda a data da BAIXA no item, entao "recebido no periodo"
 * significa: quanto ja foi pago dos lancamentos EMITIDOS no periodo. E o recorte honesto que o
 * dado permite, e e o mesmo eixo (data do documento) que contas a pagar/receber usam. Sem
 * periodo, o piso e a data de inicio das analises , nunca o historico inteiro (era o bug: a
 * funcao recebia o periodo da tool e o ignorava, somando todo o cache).
 */
export async function faturamentoRecebido(
  prisma: PrismaClient,
  input: FaturamentoInput,
): Promise<FaturamentoRecebidoResultado> {
  const j = janelaClampada(input.periodoDe, input.periodoAte);
  const where: Prisma.FatoFinanceiroLancamentoItemWhereInput = {
    pedidoId: { not: null },
    dataDocumento: { gte: j.gte, lt: j.lt },
  };

  if (input.empresaId !== undefined) {
    const pedidos = await prisma.fatoPedido.findMany({
      where: { empresaId: input.empresaId },
      select: { odooId: true },
    });
    where.pedidoId = { in: pedidos.map((p) => p.odooId) };
  }

  const [agg, distintos] = await Promise.all([
    prisma.fatoFinanceiroLancamentoItem.aggregate({ _sum: { vrPagoTotal: true, vrSaldo: true }, where }),
    prisma.fatoFinanceiroLancamentoItem.findMany({ where, select: { pedidoId: true }, distinct: ["pedidoId"] }),
  ]);

  return {
    disponivelPorPedido: true,
    disponivelPorNota: false,
    recebido: Number(agg._sum.vrPagoTotal ?? 0),
    aReceber: Number(agg._sum.vrSaldo ?? 0),
    pedidosComLancamento: distintos.length,
    gapNota:
      "Recebido disponivel por pedido (elo fato_financeiro_lancamento_item.pedido_id). " +
      "Por nota individual e gap: falta o elo nota->financeiro (notaId/chaveNfe no pedido), previsto para a Fase 2.",
  };
}
