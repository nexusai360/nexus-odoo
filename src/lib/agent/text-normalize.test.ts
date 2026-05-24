import { humanizeName } from "./text-normalize";

describe("humanizeName", () => {
  test("CAPS comum vira Title Case com stopwords minusculas", () => {
    expect(humanizeName("MOLA ESPIRAL EM ACO")).toBe("Mola Espiral em Aco");
  });

  test("preserva acentos", () => {
    expect(humanizeName("MOLA ESPIRAL EM AÇO CROMADO")).toBe(
      "Mola Espiral em Aço Cromado",
    );
  });

  test("preserva codigos numericos e modelos com digito", () => {
    expect(humanizeName("[1467] CABO DE AÇO - CNYG186X19APR009")).toBe(
      "[1467] Cabo de Aço - CNYG186X19APR009",
    );
  });

  test("preserva siglas curtas tipo LED, MX, USB", () => {
    expect(humanizeName("PAINEL LED MX (LED-C)")).toBe(
      "Painel LED MX (LED-C)",
    );
  });

  test("preserva modelo T600X mantendo as palavras humanas em title case", () => {
    // "C/" fica em maiusculo (heuristica conservadora: monoletras nao viram
    // stopword para nao colidir com codigos do tipo "LED-C").
    expect(
      humanizeName("T600X ESTEIRA C/ INCL. ELETRICA E PROG. MATRIX"),
    ).toBe("T600X Esteira C/ Incl. Eletrica e Prog. Matrix");
  });

  test("ignora string vazia e nao-string", () => {
    expect(humanizeName("")).toBe("");
    // @ts-expect-error tolerancia
    expect(humanizeName(null)).toBe(null);
  });

  test("primeira palavra sempre capitaliza mesmo sendo stopword", () => {
    expect(humanizeName("DE ACO")).toBe("De Aco");
  });

  test("preserva separadores e parenteses", () => {
    expect(humanizeName("PISO BLACK PREMIUM 1X1 16MM")).toBe(
      "Piso Black Premium 1X1 16MM",
    );
  });
});
