/**
 * Paleta de cores acessível para charts.
 *
 * Alinhada ao projeto irmão `nexus-insights`: violet como cor primária de
 * marca, pares semânticos previsíveis e contraste suficiente (>= 3:1 para
 * elementos gráficos) em backgrounds claros e escuros.
 */
export const CHART_COLORS = {
  violet: "#8b5cf6",
  emerald: "#10b981",
  amber: "#f59e0b",
  blue: "#3b82f6",
  pink: "#ec4899",
  cyan: "#06b6d4",
  orange: "#f97316",
  red: "#ef4444",
  slate: "#64748b",
  green: "#22c55e",
} as const;

export type ChartColorToken = keyof typeof CHART_COLORS;

/**
 * Paleta ordenada para séries múltiplas , ordem pensada para maximizar a
 * separação perceptual entre cores adjacentes (reduz confusão em pies/bars).
 */
export const CHART_PALETTE: readonly string[] = [
  CHART_COLORS.violet,
  CHART_COLORS.emerald,
  CHART_COLORS.amber,
  CHART_COLORS.blue,
  CHART_COLORS.pink,
  CHART_COLORS.cyan,
  CHART_COLORS.orange,
  CHART_COLORS.red,
  CHART_COLORS.slate,
] as const;

/** Retorna uma cor da paleta por índice (cycle). */
export function colorAt(i: number): string {
  if (!Number.isFinite(i) || i < 0) return CHART_PALETTE[0];
  return CHART_PALETTE[Math.floor(i) % CHART_PALETTE.length];
}

/** Alias de `colorAt` , compat com componentes portados do nexus-insights. */
export const getColorByIndex = colorAt;

/**
 * Cores que o usuário pode escolher na UI do construtor (paleta semântica do
 * design system). O `token` é o que persiste em `secao.config.cor`; o `hex`
 * é a swatch mostrada e a cor efetiva no gráfico.
 */
export const CORES_SELECIONAVEIS: readonly {
  token: ChartColorToken;
  label: string;
  hex: string;
}[] = [
  { token: "violet", label: "Violeta", hex: CHART_COLORS.violet },
  { token: "blue", label: "Azul", hex: CHART_COLORS.blue },
  { token: "cyan", label: "Ciano", hex: CHART_COLORS.cyan },
  { token: "emerald", label: "Esmeralda", hex: CHART_COLORS.emerald },
  { token: "green", label: "Verde", hex: CHART_COLORS.green },
  { token: "amber", label: "Âmbar", hex: CHART_COLORS.amber },
  { token: "orange", label: "Laranja", hex: CHART_COLORS.orange },
  { token: "pink", label: "Rosa", hex: CHART_COLORS.pink },
  { token: "red", label: "Vermelho", hex: CHART_COLORS.red },
  { token: "slate", label: "Cinza", hex: CHART_COLORS.slate },
] as const;

const HEX6 = /^#[0-9a-f]{6}$/i;

/**
 * Resolve uma escolha de cor (`secao.config.cor`) para um hex. Aceita um token
 * da paleta (`"violet"`) ou um hex direto (`"#8b5cf6"`). Retorna `null` quando
 * ausente ou inválido , o chamador então usa a cor padrão.
 */
export function corResolvida(cor: string | undefined | null): string | null {
  if (typeof cor !== "string") return null;
  const v = cor.trim();
  if (!v) return null;
  if (v in CHART_COLORS) return CHART_COLORS[v as ChartColorToken];
  if (HEX6.test(v)) return v;
  return null;
}

/**
 * Paleta para séries múltiplas (pizza/linha) ancorada numa cor escolhida: a
 * cor vem primeiro e o restante segue a ordem padrão. Token da paleta rotaciona
 * a `CHART_PALETTE` (sem perder cores); hex custom é prefixado. Sem cor válida,
 * devolve a paleta padrão.
 */
export function paletaApartirDe(
  cor: string | undefined | null,
): readonly string[] {
  const hex = corResolvida(cor);
  if (!hex) return CHART_PALETTE;
  const idx = CHART_PALETTE.indexOf(hex);
  if (idx === -1) return [hex, ...CHART_PALETTE];
  return [...CHART_PALETTE.slice(idx), ...CHART_PALETTE.slice(0, idx)];
}
