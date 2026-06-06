import { classificarRef } from "../_classificar-ref";

describe("classificarRef", () => {
  it("1-9 digitos = id", () => expect(classificarRef("123")).toBe("id"));
  it("14 digitos = documento", () => expect(classificarRef("07390039000101")).toBe("documento"));
  it("documento mascarado = documento", () => expect(classificarRef("07.390.039/0001-01")).toBe("documento"));
  it("EAN 13 digitos = codigo_numerico_longo", () => expect(classificarRef("7891234567895")).toBe("codigo_numerico_longo"));
  it("44 digitos = chave_nfe", () => expect(classificarRef("0".repeat(44))).toBe("chave_nfe"));
  it("texto livre = texto", () => expect(classificarRef("esteira T600")).toBe("texto"));
  it("50 digitos = texto (nao roteia para chave)", () => expect(classificarRef("0".repeat(50))).toBe("texto"));
  it("41 digitos = texto", () => expect(classificarRef("0".repeat(41))).toBe("texto"));
  it("numero com letra = texto", () => expect(classificarRef("123abc456")).toBe("texto"));
});
