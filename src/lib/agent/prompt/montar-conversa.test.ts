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

  test("Onda O: instrucaoTier entra no item de data (volatil, fim do prompt)", () => {
    const { conversation } = montarConversa({
      systemPromptBase: "S",
      historyMessages: [],
      userMessage: "compare maio e junho por empresa",
      agoraBrt: "2026-06-12",
      instrucaoTier: "[Pergunta composta] Decomponha em subconsultas.",
    });
    const dataItem = conversation[conversation.length - 2];
    expect(dataItem.content).toContain("[Pergunta composta]");
    expect(dataItem.content).toContain("Data atual");
  });

  test("perfil do usuario entra como item proprio logo apos o system", () => {
    const { conversation } = montarConversa({
      systemPromptBase: "REGRAS FIXAS",
      historyMessages: [],
      userMessage: "oi",
      agoraBrt: "2026-06-19",
      perfilUsuarioTexto: "Costuma consultar mais: fiscal. Ofereca por empresa.",
    });
    expect(conversation[0].role).toBe("system");
    expect(conversation[1].role).toBe("user");
    expect(conversation[1].content).toContain("[Preferências deste usuário]");
    expect(conversation[1].content).toContain("por empresa");
  });

  test("cache-safe: o systemPromptBase e identico com e sem perfil", () => {
    const sem = montarConversa({
      systemPromptBase: "REGRAS FIXAS",
      historyMessages: [],
      userMessage: "oi",
      agoraBrt: "2026-06-19",
    });
    const com = montarConversa({
      systemPromptBase: "REGRAS FIXAS",
      historyMessages: [],
      userMessage: "oi",
      agoraBrt: "2026-06-19",
      perfilUsuarioTexto: "Costuma consultar mais: fiscal.",
    });
    expect(sem.conversation[0].content).toBe(com.conversation[0].content); // system base intacto
  });

  test("perfil vazio nao injeta bloco", () => {
    const { conversation } = montarConversa({
      systemPromptBase: "S",
      historyMessages: [],
      userMessage: "oi",
      agoraBrt: "2026-06-19",
      perfilUsuarioTexto: "",
    });
    expect(conversation.some((m) => m.content.includes("[Preferências deste usuário]"))).toBe(false);
  });

  // Data de inicio das analises: o aviso e VOLATIL (o dono muda a data na tela),
  // entao vive no item de [Contexto], nunca no prefixo estavel do system.
  test("corte: o aviso entra no item de [Contexto], junto da data atual", () => {
    const { conversation } = montarConversa({
      systemPromptBase: "REGRAS FIXAS",
      historyMessages: [],
      userMessage: "quanto faturei em 2025?",
      agoraBrt: "domingo, 12/07/2026",
      corteAviso:
        "A plataforma considera apenas documentos a partir de 10/05/2026; não há dados anteriores a essa data.",
    });
    const dataItem = conversation[conversation.length - 2];
    expect(dataItem.content).toContain("[Contexto] Data atual");
    expect(dataItem.content).toContain("[Inicio das analises]");
    expect(dataItem.content).toContain("10/05/2026");
  });

  test("corte: cache-safe , o systemPromptBase nao carrega a data do corte", () => {
    const { conversation } = montarConversa({
      systemPromptBase: "REGRAS FIXAS",
      historyMessages: [],
      userMessage: "oi",
      agoraBrt: "domingo, 12/07/2026",
      corteAviso: "A plataforma considera apenas documentos a partir de 10/05/2026.",
    });
    expect(conversation[0].content).toBe("REGRAS FIXAS");
    expect(conversation[0].content).not.toContain("10/05/2026");
  });

  test("corte ausente: nenhum bloco de inicio das analises e injetado", () => {
    const { conversation } = montarConversa({
      systemPromptBase: "S",
      historyMessages: [],
      userMessage: "oi",
      agoraBrt: "12/07/2026",
    });
    expect(conversation.some((m) => m.content.includes("[Inicio das analises]"))).toBe(false);
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
