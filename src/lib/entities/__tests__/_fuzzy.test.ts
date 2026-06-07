import { levenshtein, normalizar, scoreFuzzy } from "../_fuzzy";

describe("levenshtein", () => {
  it("kitten -> sitting = 3", () => expect(levenshtein("kitten", "sitting")).toBe(3));
  it("vazios = 0", () => expect(levenshtein("", "")).toBe(0));
  it("abc -> '' = 3", () => expect(levenshtein("abc", "")).toBe(3));
  it("flaw -> lawn = 2", () => expect(levenshtein("flaw", "lawn")).toBe(2));
  it("simetrico", () => expect(levenshtein("abc", "xyz")).toBe(levenshtein("xyz", "abc")));
});

describe("normalizar", () => {
  it("lowercase + trim + colapsa espacos", () => expect(normalizar("Acucar  ESTEIRA ")).toBe("acucar esteira"));
  it("remove acento", () => expect(normalizar("Estação")).toBe("estacao"));
  it("colapsa espacos internos e trim", () => expect(normalizar("  a   b  ")).toBe("a b"));
  it("vazio", () => expect(normalizar("")).toBe(""));
});

describe("scoreFuzzy", () => {
  it("iguais = 1", () => expect(scoreFuzzy("esteira", "esteira")).toBe(1));
  it("1 char diferente ~ 0.857", () => expect(scoreFuzzy("esteira", "estewra")).toBeCloseTo(0.857, 2));
  it("totalmente diferentes < 0.4", () => expect(scoreFuzzy("abc", "xyzqwe")).toBeLessThan(0.4));
  it("ambos vazios = 1", () => expect(scoreFuzzy("", "")).toBe(1));
  it("normaliza antes de comparar", () => expect(scoreFuzzy("Esteira ", "esteira")).toBe(1));
});
