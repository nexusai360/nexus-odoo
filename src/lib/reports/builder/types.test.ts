import {
  SHAPES_DERIVADOS,
  ICONES_VALIDOS,
  ehShapeDerivado,
  ehIconeValido,
} from "./types";

describe("builder/types , constantes e guards", () => {
  it("SHAPES_DERIVADOS cobre os shapes do construtor (inclui cascata p/ waterfall)", () => {
    expect([...SHAPES_DERIVADOS].sort()).toEqual(
      ["agregacaoCategorica", "cascata", "kpis", "serieTemporal", "tabela"].sort(),
    );
  });

  it("ICONES_VALIDOS bate com o set do resolveReportIcon", () => {
    expect([...ICONES_VALIDOS].sort()).toEqual(
      ["ArrowLeftRight", "Boxes", "Clock", "Coins", "PieChart", "TrendingUp"].sort(),
    );
  });

  it("ehShapeDerivado aceita valido e rejeita invalido", () => {
    expect(ehShapeDerivado("tabela")).toBe(true);
    expect(ehShapeDerivado("hologram")).toBe(false);
  });

  it("ehIconeValido aceita valido e rejeita invalido", () => {
    expect(ehIconeValido("Boxes")).toBe(true);
    expect(ehIconeValido("Foguete")).toBe(false);
  });
});
