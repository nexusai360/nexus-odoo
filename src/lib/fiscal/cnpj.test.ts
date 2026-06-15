// B2 Cobertura Cliente , normalizacao do vat do Odoo (formato BR-XX.XXX.XXX/XXXX-XX).
import { describe, it, expect } from "@jest/globals";
import { normalizarCnpj, raizCnpj, formatarCnpj } from "./cnpj";

describe("cnpj (vat do Odoo)", () => {
  it("normaliza vat com prefixo BR- e mascara", () => {
    expect(normalizarCnpj("BR-18.282.961/0001-00")).toBe("18282961000100");
    expect(normalizarCnpj("18.282.961/0001-00")).toBe("18282961000100");
    expect(normalizarCnpj("18282961000100")).toBe("18282961000100");
  });

  it("invalido => null (CPF de 11 digitos NAO e CNPJ; lixo tambem nao)", () => {
    expect(normalizarCnpj(null)).toBeNull();
    expect(normalizarCnpj(undefined)).toBeNull();
    expect(normalizarCnpj("abc")).toBeNull();
    expect(normalizarCnpj("123.456.789-00")).toBeNull(); // 11 digitos = CPF
  });

  it("raiz = 8 primeiros digitos", () => {
    expect(raizCnpj("BR-18.282.961/0001-00")).toBe("18282961");
    expect(raizCnpj("123")).toBeNull();
  });

  it("formata para exibicao", () => {
    expect(formatarCnpj("18282961000100")).toBe("18.282.961/0001-00");
    expect(formatarCnpj("BR-18.282.961/0001-00")).toBe("18.282.961/0001-00");
    expect(formatarCnpj("abc")).toBeNull();
  });
});
