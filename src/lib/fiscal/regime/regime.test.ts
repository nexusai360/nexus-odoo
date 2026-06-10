import { REGIME_LABELS, regimeLabel, cnpjRaiz } from "./regime";

describe("regime , rótulos", () => {
  it("mapeia os 5 códigos do Odoo", () => {
    expect(regimeLabel("1")).toBe("Simples Nacional");
    expect(regimeLabel("2")).toBe("Simples Nacional (excesso de sublimite)");
    expect(regimeLabel("3")).toBe("Lucro Presumido");
    expect(regimeLabel("3.1")).toBe("Lucro Real");
    expect(regimeLabel("4")).toBe("MEI");
  });

  it("tolera espaço e devolve fallback honesto para vazio/desconhecido", () => {
    expect(regimeLabel(" 3.1 ")).toBe("Lucro Real");
    expect(regimeLabel("")).toBe("Regime não informado");
    expect(regimeLabel(null)).toBe("Regime não informado");
    expect(regimeLabel("9")).toBe("Regime não informado");
  });

  it("REGIME_LABELS cobre exatamente os códigos esperados", () => {
    expect(Object.keys(REGIME_LABELS).sort()).toEqual(["1", "2", "3", "3.1", "4"]);
  });
});

describe("regime , cnpjRaiz", () => {
  it("extrai os 8 primeiros dígitos de um CNPJ mascarado", () => {
    expect(cnpjRaiz("18.282.961/0001-00")).toBe("18282961");
    expect(cnpjRaiz("34.161.829/0007-83")).toBe("34161829");
  });

  it("tolera Unicode invisível dos labels do Odoo (ZWJ + hífen não-quebrável)", () => {
    // mesmo formato visto no label de company_id: dígitos separados por ZWJ e hífen NB
    const sujo = "35‍.156‍.509‍/0002‑93";
    expect(cnpjRaiz(sujo)).toBe("35156509");
  });

  it("matriz e filial da mesma raiz colapsam na mesma chave", () => {
    expect(cnpjRaiz("10.557.556/0001-37")).toBe(cnpjRaiz("10.557.556/0003-07"));
  });

  it("devolve null sem 8 dígitos", () => {
    expect(cnpjRaiz(null)).toBeNull();
    expect(cnpjRaiz("")).toBeNull();
    expect(cnpjRaiz("123")).toBeNull();
  });
});
