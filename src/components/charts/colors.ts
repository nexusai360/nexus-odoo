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
 * Paleta ordenada para séries múltiplas — ordem pensada para maximizar a
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
