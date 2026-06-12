import { montarConversa } from "./montar-conversa";

describe("montarConversa", () => {
  test("system prompt nao contem a data (prefixo estavel p/ cache)", () => {
    const { conversation } = montarConversa({
      systemPromptBase: "REGRAS FIXAS",
      historyMessages: [],
      userMessage: "quanto faturei?",
      agoraBrt: "quarta-feira, 2026-06-03",
    });
    const system = conversation.find((m) => m.role === "system");
    expect(system?.content).toBe("REGRAS FIXAS");
    expect(system?.content).not.toMatch(/2026-06-03/);
  });

  test("data entra como item de input imediatamente antes da pergunta", () => {
    const { conversation } = montarConversa({
      systemPromptBase: "REGRAS FIXAS",
      historyMessages: [],
      userMessage: "quanto faturei?",
      agoraBrt: "quarta-feira, 2026-06-03",
    });
    const idxData = conversation.findIndex((m) => m.content.includes("2026-06-03"));
    const idxPergunta = conversation.findIndex((m) =>
      m.content.includes("quanto faturei?"),
    );
    expect(idxData).toBeGreaterThanOrEqual(0);
    expect(idxData).toBe(idxPergunta - 1);
  });

  test("preserva o historico entre system e o item de data", () => {
    const { conversation } = montarConversa({
      systemPromptBase: "S",
      historyMessages: [
        { role: "user", content: "ola" },
        { role: "assistant", content: "oi" },
      ],
      userMessage: "tchau",
      agoraBrt: "2026-06-03",
    });
    expect(conversation.map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user", // item de data
      "user", // pergunta
    ]);
  });

  test("M.5: resumo da conversa entra como L2, entre o system e a memoria de consultas", () => {
    const { conversation } = montarConversa({
      systemPromptBase: "S",
      historyMessages: [{ role: "user", content: "ola" }],
      userMessage: "tchau",
      agoraBrt: "2026-06-12",
      resumoConversa: "Faturamento de junho: R$ 9.737.728,54 (fiscal_faturamento_periodo).",
      memoriaConsultas: ["[estoque_saldo_produto] dominio=estoque qtd=611"],
    });
    expect(conversation[0].role).toBe("system");
    expect(conversation[1].content).toContain("[Resumo da conversa]");
    expect(conversation[1].content).toContain("9.737.728,54");
    expect(conversation[2].content).toContain("[Memória da conversa]");
  });

  test("M.5: sem resumo, nenhum bloco de resumo e injetado", () => {
    const { conversation } = montarConversa({
      systemPromptBase: "S",
      historyMessages: [],
      userMessage: "oi",
      agoraBrt: "2026-06-12",
    });
    expect(conversation.some((m) => m.content.includes("[Resumo da conversa]"))).toBe(false);
  });
});
