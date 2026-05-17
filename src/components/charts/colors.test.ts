import { CHART_COLORS, CHART_PALETTE, colorAt } from "./colors";

describe("colors", () => {
  it("expõe a paleta com pelo menos 5 cores distintas", () => {
    expect(CHART_PALETTE.length).toBeGreaterThanOrEqual(5);
    expect(new Set(CHART_PALETTE).size).toBe(CHART_PALETTE.length);
  });

  it("todas as cores são hex válidos", () => {
    for (const cor of Object.values(CHART_COLORS)) {
      expect(cor).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("colorAt cicla a paleta", () => {
    expect(colorAt(0)).toBe(CHART_PALETTE[0]);
    expect(colorAt(CHART_PALETTE.length)).toBe(CHART_PALETTE[0]);
    expect(colorAt(1)).toBe(CHART_PALETTE[1]);
  });

  it("colorAt trata índices inválidos com fallback", () => {
    expect(colorAt(-1)).toBe(CHART_PALETTE[0]);
    expect(colorAt(Number.NaN)).toBe(CHART_PALETTE[0]);
  });
});
