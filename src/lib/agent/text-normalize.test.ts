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

  // F4 Apresentacao, Onda 3.1
  describe("sufixos societarios e UF preservados em CAIXA ALTA", () => {
    test("LTDA / ME / EPP / EIRELI / MEI / CIA preservados", () => {
      expect(humanizeName("EMPRESA XYZ LTDA")).toBe("Empresa XYZ LTDA");
      expect(humanizeName("JOAO DA SILVA ME")).toBe("Joao da Silva ME");
      expect(humanizeName("COMERCIAL ABC EIRELI")).toBe("Comercial Abc EIRELI");
      expect(humanizeName("PADARIA DO ZE MEI")).toBe("Padaria do Ze MEI");
      expect(humanizeName("LOJA E CIA")).toBe("Loja e CIA");
    });

    test("S.A. e S/A preservam o separador e a caixa alta", () => {
      expect(humanizeName("INDUSTRIA S.A.")).toBe("Industria S.A.");
      expect(humanizeName("INDUSTRIA S/A")).toBe("Industria S/A");
    });

    test("UF com vogal vira maiuscula (GO, BA, SP, ...)", () => {
      expect(humanizeName("GOIANIA GO")).toBe("Goiania GO");
      expect(humanizeName("SALVADOR BA")).toBe("Salvador BA");
      expect(humanizeName("SAO PAULO SP")).toBe("Sao Paulo SP");
    });

    test("nao corrompe nomes ja humanizados (idempotente)", () => {
      for (const s of [
        "Empresa XYZ LTDA",
        "Joao da Silva ME",
        "Industria S.A.",
        "JHT do Brasil",
        "3R Fitness",
      ]) {
        expect(humanizeName(s)).toBe(s);
        expect(humanizeName(humanizeName(s))).toBe(humanizeName(s));
      }
    });

    test("token com digito / sigla / maiuscula interna intactos", () => {
      expect(humanizeName("JHT do Brasil")).toBe("JHT do Brasil");
      expect(humanizeName("3R Fitness")).toBe("3R Fitness");
      expect(humanizeName("[1467] CABO DE AÇO - CNYG186X19APR009")).toBe(
        "[1467] Cabo de Aço - CNYG186X19APR009",
      );
    });
  });
});
