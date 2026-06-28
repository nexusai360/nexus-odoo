import { janelaAnterior, calcularDeltaKpi } from "./janela-anterior";

describe("janelaAnterior", () => {
  it("desloca a janela para o periodo imediatamente anterior, de mesmo tamanho", () => {
    // Jan..Mar 2026 (3 meses) -> Out..Dez 2025
    expect(janelaAnterior("2026-01", "2026-03")).toEqual({ de: "2025-10", ate: "2025-12" });
  });

  it("janela de 1 mes vira o mes anterior", () => {
    expect(janelaAnterior("2026-03", "2026-03")).toEqual({ de: "2026-02", ate: "2026-02" });
  });

  it("retorna null quando falta um dos limites ou o formato e invalido", () => {
    expect(janelaAnterior(undefined, "2026-03")).toBeNull();
    expect(janelaAnterior("2026-03", undefined)).toBeNull();
    expect(janelaAnterior("xx", "2026-03")).toBeNull();
  });
});

describe("calcularDeltaKpi", () => {
  it("variacao positiva = direction up", () => {
    expect(calcularDeltaKpi(120, 100)).toEqual({ direction: "up", percent: 20 });
  });

  it("variacao negativa = direction down (percent absoluto)", () => {
    expect(calcularDeltaKpi(80, 100)).toEqual({ direction: "down", percent: 20 });
  });

  it("igual = flat", () => {
    expect(calcularDeltaKpi(100, 100)).toEqual({ direction: "flat", percent: 0 });
  });

  it("base zero ou invalida nao tem delta honesto (null)", () => {
    expect(calcularDeltaKpi(50, 0)).toBeNull();
    expect(calcularDeltaKpi(50, Number.NaN)).toBeNull();
  });
});
