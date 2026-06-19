import {
  temDigitosLongos,
  compartilhaTrigramaCom,
  violaPrivacidade,
  ALLOWLIST_NEGOCIO,
} from "./pii-guard";

describe("temDigitosLongos", () => {
  it("pega CNPJ formatado (normaliza separadores)", () => {
    expect(temDigitosLongos("CNPJ 11.222.333/0001-44")).toBe(true);
  });
  it("pega valor grande", () => {
    expect(temDigitosLongos("1.250.000,00")).toBe(true);
  });
  it("nao acusa numeros curtos (ate 6 digitos)", () => {
    expect(temDigitosLongos("top 5 produtos do mes")).toBe(false);
  });
});

describe("compartilhaTrigramaCom", () => {
  it("acusa copia verbatim de 3+ palavras", () => {
    const orig = ["qual o faturamento da loja matriz neste mes"];
    expect(compartilhaTrigramaCom("prefere ver o faturamento da loja sempre", orig)).toBe(true);
  });
  it("nao acusa quando nao ha trigrama comum", () => {
    const orig = ["quanto tem no estoque hoje"];
    expect(compartilhaTrigramaCom("gosta de faturamento por empresa", orig)).toBe(false);
  });
});

describe("violaPrivacidade", () => {
  it("bloqueia digitos longos / CNPJ", () => {
    expect(violaPrivacidade("cliente 11.222.333/0001-44", [])).toBe(true);
  });
  it("bloqueia e-mail", () => {
    expect(violaPrivacidade("falar com mariane@empresa.com", [])).toBe(true);
  });
  it("bloqueia nome proprio fora do allowlist", () => {
    expect(violaPrivacidade("prefere relatorios da Smartfit", [])).toBe(true);
  });
  it("bloqueia copia verbatim via trigrama", () => {
    expect(
      violaPrivacidade("ver o faturamento por empresa", ["quero ver o faturamento por empresa toda semana"]),
    ).toBe(true);
  });
  it("ACEITA texto so com termos de negocio em minusculo", () => {
    expect(
      violaPrivacidade("usuario prefere faturamento por empresa e acompanha estoque", []),
    ).toBe(false);
  });
  it("allowlist cobre os termos chave", () => {
    expect(ALLOWLIST_NEGOCIO).toEqual(expect.arrayContaining(["faturamento", "empresa", "estoque"]));
  });
});
