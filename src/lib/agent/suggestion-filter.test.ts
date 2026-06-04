import { filterSuggestions, normalizeForMatch } from "./suggestion-filter";

describe("normalizeForMatch", () => {
  test("remove acento, pontuacao e caixa", () => {
    expect(normalizeForMatch("Compare o estoque atual com o do mês passado.")).toBe(
      "compare o estoque atual com o do mes passado",
    );
  });
});

describe("filterSuggestions", () => {
  test("remove sugestao identica a uma pergunta ja feita (trava 1)", () => {
    const out = filterSuggestions(
      ["Qual o faturamento deste mês?", "Quais notas saíram hoje?"],
      { asked: ["qual o faturamento deste mes?"] },
    );
    expect(out).toEqual(["Quais notas saíram hoje?"]);
  });

  test("remove sugestao que bate com gap conhecido, mesmo reformulada (trava 2)", () => {
    const out = filterSuggestions(
      ["Compare o estoque atual com o do mês passado."],
      { gaps: ["Comparar o estoque atual com o do mês passado"] },
    );
    expect(out).toEqual([]);
  });

  test("mantem sugestoes nao perguntadas e fora dos gaps", () => {
    const out = filterSuggestions(
      ["Quanto faturamos no mês corrente?", "Qual o saldo de estoque?"],
      { asked: ["compare o estoque com mes passado"], gaps: ["lista de transportadoras ativas"] },
    );
    expect(out).toHaveLength(2);
  });

  test("bloqueia gap reformulado com verbo diferente (lista/liste)", () => {
    const out = filterSuggestions(["Liste as transportadoras ativas"], {
      gaps: ["Lista de transportadoras ativas"],
    });
    expect(out).toEqual([]);
  });

  test("mantem pergunta CAPAZ mesmo que um gap mal-registrado colida (whitelist)", () => {
    // "Quanto faturamos no mês corrente?" e capaz (esta no TOOL_TO_QUESTION).
    const out = filterSuggestions(["Quanto faturamos no mês corrente?"], {
      gaps: ["Quanto faturamos no mês corrente"],
    });
    expect(out).toEqual(["Quanto faturamos no mês corrente?"]);
  });

  test("dedup interno de sugestoes repetidas", () => {
    const out = filterSuggestions(
      ["Quanto faturamos?", "quanto faturamos?"],
      {},
    );
    expect(out).toHaveLength(1);
  });
});
