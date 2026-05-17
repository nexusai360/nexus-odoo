// src/components/charts/palette.ts

/**
 * Paleta categórica derivada dos design tokens `--chart-1..5` de `globals.css`.
 * Usar `var(--chart-*)` garante adaptação automática a light/dark e mantém a
 * cor de marca (roxo) nos gráficos. As cores são referências CSS, resolvidas
 * pelo navegador no tema corrente.
 */
export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

/** Cor do índice n, ciclando a paleta. */
export function colorAt(n: number): string {
  return CHART_COLORS[n % CHART_COLORS.length];
}
