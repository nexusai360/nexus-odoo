import { CHART_COLORS, colorAt } from "./palette";

describe("paleta de gráficos", () => {
  it("tem ao menos 6 cores", () => {
    expect(CHART_COLORS.length).toBeGreaterThanOrEqual(6);
  });
  it("colorAt cicla as cores por índice", () => {
    expect(colorAt(0)).toBe(CHART_COLORS[0]);
    expect(colorAt(CHART_COLORS.length)).toBe(CHART_COLORS[0]);
  });
});
