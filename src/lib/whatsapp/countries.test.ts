import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  findCountryByE164,
  splitE164,
  composeE164,
  formatNational,
  formatE164ForDisplay,
  searchCountries,
  areEquivalentNumbers,
  phoneVariants,
} from "./countries";

describe("COUNTRIES", () => {
  it("tem o Brasil como país padrão", () => {
    expect(DEFAULT_COUNTRY.iso).toBe("BR");
    expect(DEFAULT_COUNTRY.dial).toBe("+55");
  });

  it("não tem ISO duplicado", () => {
    const isos = COUNTRIES.map((c) => c.iso);
    expect(new Set(isos).size).toBe(isos.length);
  });
});

describe("findCountryByE164", () => {
  it("reconhece um número brasileiro", () => {
    expect(findCountryByE164("+5511991234567")?.iso).toBe("BR");
  });

  it("prefere o prefixo mais longo (Paraguai +595 não vira Brasil +55)", () => {
    expect(findCountryByE164("+595991234567")?.iso).toBe("PY");
  });

  it("reconhece +1 como Estados Unidos", () => {
    expect(findCountryByE164("+12025550123")?.iso).toBe("US");
  });

  it("retorna undefined para DDI fora da lista curada", () => {
    expect(findCountryByE164("+9991234567")).toBeUndefined();
  });
});

describe("splitE164", () => {
  it("separa o DDI do número nacional", () => {
    const r = splitE164("+5511991234567");
    expect(r.country?.iso).toBe("BR");
    expect(r.nationalDigits).toBe("11991234567");
  });

  it("sem país reconhecido, devolve todos os dígitos como nacional", () => {
    const r = splitE164("+9991234567");
    expect(r.country).toBeUndefined();
    expect(r.nationalDigits).toBe("9991234567");
  });
});

describe("composeE164", () => {
  it("junta DDI e número nacional com máscara em E.164 limpo", () => {
    expect(composeE164("+55", "(11) 99123-4567")).toBe("+5511991234567");
  });

  it("ignora separadores e espaços do número nacional", () => {
    expect(composeE164("+55", "11 9 9123 4567")).toBe("+5511991234567");
  });
});

describe("formatNational", () => {
  const br = DEFAULT_COUNTRY;

  it("formata celular brasileiro (11 dígitos) como DDD 9XXXX-XXXX", () => {
    expect(formatNational(br, "11991234567")).toBe("11 99123-4567");
  });

  it("formata fixo brasileiro (10 dígitos) como DDD XXXX-XXXX", () => {
    expect(formatNational(br, "1133224455")).toBe("11 3322-4455");
  });

  it("número parcial é devolvido sem máscara forçada", () => {
    expect(formatNational(br, "1199")).toBe("1199");
  });
});

describe("searchCountries", () => {
  it("busca vazia devolve a lista inteira", () => {
    expect(searchCountries("")).toHaveLength(COUNTRIES.length);
  });

  it("busca pelo nome em português", () => {
    expect(searchCountries("brasil").map((c) => c.iso)).toContain("BR");
  });

  it("ignora acento na busca (mexico encontra México)", () => {
    expect(searchCountries("mexico").map((c) => c.iso)).toContain("MX");
  });

  it("encontra país por trecho do nome (esta -> Estados Unidos)", () => {
    expect(searchCountries("esta").map((c) => c.iso)).toContain("US");
  });

  it("busca pelo código de discagem, com ou sem +", () => {
    expect(searchCountries("+55").map((c) => c.iso)).toContain("BR");
    expect(searchCountries("351").map((c) => c.iso)).toContain("PT");
  });

  it("sem correspondência devolve lista vazia", () => {
    expect(searchCountries("xyzzy")).toHaveLength(0);
  });
});

describe("areEquivalentNumbers (nono dígito BR)", () => {
  it("celular com e sem o nono dígito são o mesmo número", () => {
    expect(
      areEquivalentNumbers("+5561984409067", "+556184409067"),
    ).toBe(true);
  });

  it("é simétrico (sem 9 vs com 9)", () => {
    expect(
      areEquivalentNumbers("+556184409067", "+5561984409067"),
    ).toBe(true);
  });

  it("números idênticos são equivalentes", () => {
    expect(
      areEquivalentNumbers("+5561984409067", "+5561984409067"),
    ).toBe(true);
  });

  it("DDD diferente não é equivalente", () => {
    expect(
      areEquivalentNumbers("+5561984409067", "+5562984409067"),
    ).toBe(false);
  });

  it("último dígito diferente não é equivalente", () => {
    expect(
      areEquivalentNumbers("+5561984409067", "+5561984409068"),
    ).toBe(false);
  });

  it("fixo (10 dígitos) não vira celular pela regra do 9", () => {
    // +556133224455 é fixo; +5561933224455 teria o 9 na frente de um número
    // que começa com 3 (faixa de fixo), logo não é a mesma coisa.
    expect(
      areEquivalentNumbers("+556133224455", "+5561933224455"),
    ).toBe(false);
  });

  it("regra do 9 não vale fora do Brasil", () => {
    expect(areEquivalentNumbers("+12025550123", "+1202550123")).toBe(false);
  });
});

describe("phoneVariants", () => {
  it("celular com 9 inclui a forma sem 9", () => {
    const v = phoneVariants("+5561984409067");
    expect(v).toContain("+5561984409067");
    expect(v).toContain("+556184409067");
  });

  it("celular sem 9 inclui a forma com 9", () => {
    const v = phoneVariants("+556184409067");
    expect(v).toContain("+556184409067");
    expect(v).toContain("+5561984409067");
  });

  it("fixo não gera variante de nono dígito", () => {
    expect(phoneVariants("+556133224455")).toEqual(["+556133224455"]);
  });

  it("número fora do Brasil não gera variantes", () => {
    expect(phoneVariants("+12025550123")).toEqual(["+12025550123"]);
  });
});

describe("formatE164ForDisplay", () => {
  it("formata um celular brasileiro completo de forma legível", () => {
    expect(formatE164ForDisplay("+5561984409067")).toBe("+55 61 98440-9067");
  });

  it("formata número de país não-BR com DDI + nacional", () => {
    expect(formatE164ForDisplay("+12025550123")).toBe("+1 2025550123");
  });

  it("número sem país reconhecido volta com o + e os dígitos", () => {
    expect(formatE164ForDisplay("+9991234567")).toBe("+9991234567");
  });
});
