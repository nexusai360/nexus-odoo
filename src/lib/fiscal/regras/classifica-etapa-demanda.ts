// src/lib/fiscal/regras/classifica-etapa-demanda.ts
// Classifica o ESTAGIO de uma etapa de pedido quanto a demanda em aberta, a partir
// dos gatilhos da propria etapa (raw_pedido_etapa.data). Funcao PURA, sem I/O.
//
// Contrato: decide apenas o estagio (ABERTA/FECHADA/IGNORAR) assumindo uma operacao
// de venda ao cliente. A combinacao com a OPERACAO (so vendas externas entram na
// demanda) e com o gate de aprovacao (data_aprovacao) e feita no motor/builder, nao
// aqui. Ver dossie pericia-fluxos-2026-07/03 e SPEC v3 secao 3.

/** Estagio da etapa quanto a demanda (antes de cruzar com a operacao). */
export type EstagioDemanda = "ABERTA" | "FECHADA" | "IGNORAR";

/** Gatilhos relevantes de uma etapa (subconjunto de raw_pedido_etapa.data). */
export interface GatilhosEtapa {
  nome: string;
  /** Emite/transmite a nota fiscal (finaliza_faturamento). */
  finalizaFaturamento: boolean;
  /** Conclui o pedido (finaliza_pedido_confirmando). */
  finalizaPedidoConfirmando: boolean;
  /** Cancela o pedido (finaliza_pedido_cancelando). */
  finalizaPedidoCancelando: boolean;
}

/**
 * Classifica o estagio da etapa quanto a demanda (por gatilho, sem excecao por nome).
 * Ordem: cancelamento > conclusao/emissao > (fallback) ABERTA.
 *
 * NOTA (Fase 1A): quem decide "demanda a entregar = ABERTA" e a whitelist autoritativa
 * ETAPAS_DEMANDA_ABERTA no builder (bucketDoPedido). Esta funcao continua util como leitura
 * de estagio da etapa, mas NAO e mais a fonte do bucket. A excecao antiga "Nota emitida e nao
 * entregue" saiu: a etapa 226 e mantida na demanda pela whitelist, nao por nome.
 */
export function classificaEtapaDemanda(g: GatilhosEtapa): EstagioDemanda {
  if (g.finalizaPedidoCancelando) return "IGNORAR";
  if (g.finalizaFaturamento || g.finalizaPedidoConfirmando) return "FECHADA";
  return "ABERTA";
}
