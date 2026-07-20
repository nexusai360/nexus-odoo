// Utils puros de cor da etapa do pedido (bloco B-09, Entregas Parciais).
//
// A cor da etapa vem do Odoo em `raw_pedido_etapa.data->>'cor'`: hex literal
// ("#fa7e1e") quando definida, ou `false` (boolean JSON) quando vazia. Estas
// funcoes normalizam esse valor cru e derivam o estilo translucido da tag, sem
// nunca usar o hex saturado no texto (contraste fica a cargo da UI, sempre AA).

/**
 * Normaliza o valor cru de `raw_pedido_etapa.data->>'cor'` para um hex valido.
 * No Odoo (SPED Tauga) a cor vem como hex literal ("#fa7e1e") quando definida ou
 * como `false` (boolean JSON) quando vazia. Qualquer coisa que nao seja um hex
 * valido (3 ou 6 digitos) vira null (a UI cai na tag neutra).
 */
export function corEtapaValida(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const hex = raw.trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex) ? hex : null;
}
