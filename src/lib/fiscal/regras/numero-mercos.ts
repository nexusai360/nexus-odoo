/**
 * Extrai o número de referência do pedido no Mercos (CRM de vendas externo) do texto
 * livre `obs` do pedido do Odoo. A FONTE DA VERDADE é o texto do Odoo; esta função só
 * o estrutura. Formato real (medido no cache): "PEDIDO MERCOS: NNNNN", 4-5 dígitos.
 *
 * `(?!ul)` barra "mercosul" (um `\b` ANTES de "mercos" não barraria, pois "mercosul"
 * começa numa fronteira de palavra). `[^0-9\n]{0,10}` tolera ": ", " ", "N " etc. entre a
 * palavra e o número, mas NÃO atravessa quebra de linha (não pega um número de outra
 * linha). `{4,7}` cobre 4-5 dígitos de hoje e crescimento do CRM; o `(?![0-9])` final
 * rejeita blocos de 8+ dígitos (não trunca silenciosamente). Retorna só os dígitos, ou null.
 */
const RE_MERCOS = /mercos(?!ul)[^0-9\n]{0,10}([0-9]{4,7})(?![0-9])/i;

export function extrairNumeroMercos(obs: string | null | undefined): string | null {
  if (!obs) return null;
  const m = RE_MERCOS.exec(obs);
  return m ? m[1] : null;
}
