import { CHART_COLORS, colorAt } from "./palette";

describe("paleta de gráficos", () => {
  it("usa os 5 tokens de gráfico do design system", () => {
    expect(CHART_COLORS).toHaveLength(5);
    expect(CHART_COLORS.every((c) => c.startsWith("var(--chart-"))).toBe(true);
  });
  it("colorAt cicla as cores por índice", () => {
    expect(colorAt(0)).toBe(CHART_COLORS[0]);
    expect(colorAt(CHART_COLORS.length)).toBe(CHART_COLORS[0]);
  });
});
