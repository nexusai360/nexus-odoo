import { describe, it, expect } from "@jest/globals";
import { cobertura, coberturaPct } from "./cobertura.js";

describe("cobertura (F4 Onda 3.3)", () => {
  it("cobertura parcial gera aviso com a fracao real", () => {
    expect(
      cobertura({
        consideradosComDado: 42,
        totalConsiderado: 100,
        campo: "preco de custo",
        rotulo: "Margem",
      }),
    ).toBe("Margem calculada sobre 42 de 100 (58 sem preco de custo).");
  });

  it("cobertura total nao gera aviso (string vazia)", () => {
    expect(
      cobertura({ consideradosComDado: 100, totalConsiderado: 100, campo: "x", rotulo: "ROI" }),
    ).toBe("");
  });

  it("total zero nao gera aviso", () => {
    expect(
      cobertura({ consideradosComDado: 0, totalConsiderado: 0, campo: "x", rotulo: "ROI" }),
    ).toBe("");
  });

  it("clampa comDado acima do total (nunca aviso negativo)", () => {
    expect(
      cobertura({ consideradosComDado: 120, totalConsiderado: 100, campo: "x", rotulo: "Y" }),
    ).toBe("");
  });

  it("coberturaPct arredonda a fracao real", () => {
    expect(coberturaPct(42, 100)).toBe(42);
    expect(coberturaPct(1, 3)).toBe(33);
    expect(coberturaPct(2, 3)).toBe(67);
    expect(coberturaPct(0, 0)).toBe(0);
    expect(coberturaPct(200, 100)).toBe(100);
  });
});
