// src/lib/fiscal/grupo/__tests__/whitelist-grupo.test.ts
import {
  PARTICIPANTES_GRUPO_WHITELIST,
  PARTICIPANTES_RECICLADOS_EXCLUIDOS,
} from "../whitelist-grupo";

describe("PARTICIPANTES_GRUPO_WHITELIST", () => {
  it("contem exatamente os 15 participante_id do grupo validados no cache (2026-06-10)", () => {
    expect([...PARTICIPANTES_GRUPO_WHITELIST].sort((a, b) => a - b)).toEqual([
      2, 9, 10, 11, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 24,
    ]);
  });

  it("NAO inclui odoo_id reciclados (Vilmar/Smartfit/Jaguaribe/Residencial)", () => {
    for (const id of [7719, 8722, 8723, 9552]) {
      expect(PARTICIPANTES_GRUPO_WHITELIST.has(id)).toBe(false);
      expect(PARTICIPANTES_RECICLADOS_EXCLUIDOS.has(id)).toBe(true);
    }
  });

  it("NAO inclui franquias Matrix Fit (clientes externos)", () => {
    for (const id of [7672, 16003]) {
      expect(PARTICIPANTES_GRUPO_WHITELIST.has(id)).toBe(false);
    }
  });

  it("whitelist e reciclados sao conjuntos disjuntos", () => {
    for (const id of PARTICIPANTES_GRUPO_WHITELIST) {
      expect(PARTICIPANTES_RECICLADOS_EXCLUIDOS.has(id)).toBe(false);
    }
  });
});
