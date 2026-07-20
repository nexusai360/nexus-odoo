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

/** Converte um hex (3 ou 6 digitos) em [r, g, b] (0..255), ou null se invalido. */
function normalizarHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Monta uma cor rgba() a partir do hex e de um alpha (0..1). null se hex invalido. */
export function hexParaRgba(hex: string, alpha: number): string | null {
  const rgb = normalizarHex(hex);
  if (!rgb) return null;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

/** Luminancia relativa WCAG (0 = preto, 1 = branco). Util para escolher texto. */
export function luminanciaRelativa(hex: string): number | null {
  const rgb = normalizarHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
