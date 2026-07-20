import {
  corEtapaValida,
  hexParaRgba,
  luminanciaRelativa,
} from "./etapa-cor";

describe("corEtapaValida", () => {
  it("aceita hex de 6 digitos", () => {
    expect(corEtapaValida("#fa7e1e")).toBe("#fa7e1e");
  });
  it("aceita hex de 3 digitos", () => {
    expect(corEtapaValida("#0a0")).toBe("#0a0");
  });
  it("trata false (sem cor no Odoo) como null", () => {
    expect(corEtapaValida(false)).toBeNull();
  });
  it("trata numero/objeto/null/undefined como null", () => {
    expect(corEtapaValida(3)).toBeNull();
    expect(corEtapaValida(null)).toBeNull();
    expect(corEtapaValida(undefined)).toBeNull();
    expect(corEtapaValida({})).toBeNull();
  });
  it("rejeita string que nao e hex", () => {
    expect(corEtapaValida("laranja")).toBeNull();
    expect(corEtapaValida("#zzz")).toBeNull();
  });
  it("apara espacos ao redor", () => {
    expect(corEtapaValida("  #00b159 ")).toBe("#00b159");
  });
});

describe("hexParaRgba", () => {
  it("converte hex de 6 digitos com alpha", () => {
    expect(hexParaRgba("#ff0000", 0.14)).toBe("rgba(255, 0, 0, 0.14)");
  });
  it("expande hex de 3 digitos", () => {
    expect(hexParaRgba("#0a0", 1)).toBe("rgba(0, 170, 0, 1)");
  });
  it("devolve null para hex invalido", () => {
    expect(hexParaRgba("nope", 0.5)).toBeNull();
  });
});

describe("luminanciaRelativa", () => {
  it("branco ~ 1 e preto ~ 0", () => {
    expect(luminanciaRelativa("#ffffff")).toBeCloseTo(1, 2);
    expect(luminanciaRelativa("#000000")).toBeCloseTo(0, 2);
  });
  it("null para hex invalido", () => {
    expect(luminanciaRelativa("xyz")).toBeNull();
  });
});
