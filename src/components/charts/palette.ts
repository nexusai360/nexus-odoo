// src/components/charts/palette.ts

/** Paleta categórica acessível, testada no dark mode. */
export const CHART_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
] as const;

/** Cor do índice n, ciclando a paleta. */
export function colorAt(n: number): string {
  return CHART_COLORS[n % CHART_COLORS.length];
}
