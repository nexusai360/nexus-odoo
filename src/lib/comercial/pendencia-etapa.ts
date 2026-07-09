// src/lib/comercial/pendencia-etapa.ts
// Deriva, a partir dos GATILHOS da etapa atual de um pedido (config em
// raw_pedido_etapa), o que falta para o pedido AVANÇAR , em linguagem de negócio.
// Função PURA (sem I/O), testável. Usada na imersão do pedido
// (comercial_pedido_situacao). Se nenhum gatilho conhecido, retorna null.

export interface GatilhosEtapa {
  aprovaPedido?: boolean;
  aprovaFinanceiro?: boolean;
  aprovaEstoque?: boolean;
  aprovaFaturamento?: boolean;
  finalizaFinanceiro?: boolean;
  finalizaEstoque?: boolean;
  finalizaFaturamento?: boolean;
  finalizaPedidoConfirmando?: boolean;
}

/**
 * Lista de ações pendentes para avançar a etapa (na ordem natural do fluxo:
 * aprovação → financeiro → estoque → nota → confirmação). Cada gatilho ativo vira
 * uma frase do dono do negócio.
 */
export function pendenciasDaEtapa(g: GatilhosEtapa): string[] {
  const out: string[] = [];
  if (g.aprovaPedido) out.push("aprovar o pedido");
  if (g.aprovaFinanceiro || g.finalizaFinanceiro)
    out.push("liberar o financeiro (ex.: baixar o boleto/confirmar o pagamento)");
  if (g.aprovaEstoque || g.finalizaEstoque)
    out.push("confirmar a separação/reserva de estoque");
  if (g.aprovaFaturamento || g.finalizaFaturamento)
    out.push("emitir a nota fiscal");
  if (g.finalizaPedidoConfirmando) out.push("confirmar/concluir o pedido");
  return out;
}

/** Frase única "para avançar, falta ..." (ou null quando não há gatilho conhecido). */
export function frasePendencia(g: GatilhosEtapa): string | null {
  const p = pendenciasDaEtapa(g);
  if (p.length === 0) return null;
  if (p.length === 1) return `Para avançar, falta ${p[0]}.`;
  const ultimo = p[p.length - 1];
  return `Para avançar, falta ${p.slice(0, -1).join(", ")} e ${ultimo}.`;
}

/** Converte o texto 'true'/'false' (vindo do jsonb->>) em boolean. */
export function ehTrue(v: string | null | undefined): boolean {
  return v === "true" || v === "t" || v === "1";
}
