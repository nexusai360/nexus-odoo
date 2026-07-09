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

/** Normaliza um nome de etapa: minusculo, sem acento, espacos colapsados. */
function normalizar(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Excecao confirmada pela Mariane/observacao do Odoo: a etapa "Nota emitida e nao
 * entregue" conta como demanda ABERTA mesmo tendo nota emitida (mercadoria nao saiu).
 */
function ehExcecaoNotaEmitidaNaoEntregue(nomeNormalizado: string): boolean {
  return nomeNormalizado.startsWith("nota emitida e nao entregue");
}

/**
 * Classifica o estagio da etapa quanto a demanda.
 * Ordem de precedencia: cancelamento > excecao(nota nao entregue) > conclusao/emissao.
 */
export function classificaEtapaDemanda(g: GatilhosEtapa): EstagioDemanda {
  if (g.finalizaPedidoCancelando) return "IGNORAR";

  const nome = normalizar(g.nome);
  if (ehExcecaoNotaEmitidaNaoEntregue(nome)) return "ABERTA";

  if (g.finalizaFaturamento || g.finalizaPedidoConfirmando) return "FECHADA";

  return "ABERTA";
}
