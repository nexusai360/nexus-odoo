// src/lib/fiscal/grupo/__tests__/cnpj.test.ts
import { extrairRaizCnpj, extrairRaizCnpjDeTexto } from "../cnpj";

describe("extrairRaizCnpj", () => {
  it("pega os 8 primeiros digitos de um CNPJ (14 digitos)", () => {
    expect(extrairRaizCnpj("34161829000430")).toBe("34161829");
  });
  it("limpa mascara antes de extrair", () => {
    expect(extrairRaizCnpj("34.161.829/0004-30")).toBe("34161829");
  });
  it("exige 14 digitos: CPF (11) nao e raiz de CNPJ (B1 review)", () => {
    expect(extrairRaizCnpj("34161829000")).toBeNull(); // 11 dig = CPF
    expect(extrairRaizCnpj("123")).toBeNull();
    expect(extrairRaizCnpj(null)).toBeNull();
    expect(extrairRaizCnpj("")).toBeNull();
  });
});

describe("extrairRaizCnpjDeTexto", () => {
  it("extrai a raiz do 1o CNPJ mascarado embutido em texto livre", () => {
    const nome = "Jht SP Comercio - Filial SE 34.161.829/0004-30 - Razao [34.161.829/0004-30]";
    expect(extrairRaizCnpjDeTexto(nome)).toBe("34161829");
  });
  it("tolera Unicode no CNPJ: ZWJ (U+200D) + non-breaking hyphen (U+2011) (B1 review)", () => {
    const nome = "Matrix - Jht SP 26‍.308‍.789/0001‑36 Ltda";
    expect(extrairRaizCnpjDeTexto(nome)).toBe("26308789");
  });
  it("retorna null quando nao ha CNPJ no texto", () => {
    expect(extrairRaizCnpjDeTexto("Cliente Externo Ltda")).toBeNull();
    expect(extrairRaizCnpjDeTexto(null)).toBeNull();
  });
});
