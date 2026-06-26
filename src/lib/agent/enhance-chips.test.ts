import {
  buildEnhancePrompt,
  parseEnhanceResponse,
  EnhanceChipsError,
  MAX_EXTRACTED_CHIPS,
} from "./enhance-chips";

describe("buildEnhancePrompt", () => {
  it("inclui agentResponse e historico no prompt", () => {
    const out = buildEnhancePrompt({
      agentResponse: "TESTE_RESPOSTA",
      recentHistoryText: "[user] HIST_X",
      maxContextual: 3,
    });
    expect(out).toContain("TESTE_RESPOSTA");
    expect(out).toContain("HIST_X");
    expect(out).toContain(`max ${MAX_EXTRACTED_CHIPS} chips`);
    expect(out).toContain("ate 3 perguntas");
  });

  it("inclui o profileHint quando presente, e nao quando ausente", () => {
    const com = buildEnhancePrompt({
      agentResponse: "R",
      recentHistoryText: "H",
      maxContextual: 3,
      profileHint: "fiscal | faturamento por empresa",
    });
    expect(com).toContain("Preferencias deste usuario");
    expect(com).toContain("faturamento por empresa");

    const sem = buildEnhancePrompt({ agentResponse: "R", recentHistoryText: "H", maxContextual: 3 });
    expect(sem).not.toContain("Preferencias deste usuario");
  });
});

describe("parseEnhanceResponse", () => {
  it("parseia JSON valido com chipsSource=extracted (cap 7)", () => {
    const raw = JSON.stringify({
      cleanMessage: "Mensagem limpa.",
      chips: ["A?", "B?", "C?", "D?", "E?", "F?", "G?", "H?"],
      chipsSource: "extracted",
    });
    const r = parseEnhanceResponse(raw, { maxContextual: 3 });
    expect(r.chipsSource).toBe("extracted");
    expect(r.chips.length).toBe(7);
    expect(r.cleanMessage).toBe("Mensagem limpa.");
  });

  it("aplica cap maxContextual em chipsSource=contextual", () => {
    const raw = JSON.stringify({
      cleanMessage: "X",
      chips: ["a", "b", "c", "d", "e"],
      chipsSource: "contextual",
    });
    const r = parseEnhanceResponse(raw, { maxContextual: 3 });
    expect(r.chips.length).toBe(3);
  });

  it("sanitiza markdown nos chips", () => {
    const raw = JSON.stringify({
      cleanMessage: "X",
      chips: ["**Pergunta**", "`outra`"],
      chipsSource: "contextual",
    });
    const r = parseEnhanceResponse(raw, { maxContextual: 3 });
    expect(r.chips).toEqual(["Pergunta", "outra"]);
  });

  it("aceita JSON wrapeado em markdown fence", () => {
    const raw = "```json\n" + JSON.stringify({
      cleanMessage: "x",
      chips: ["q?"],
      chipsSource: "contextual",
    }) + "\n```";
    const r = parseEnhanceResponse(raw, { maxContextual: 3 });
    expect(r.chips).toEqual(["q?"]);
  });

  it("lanca EnhanceChipsError quando JSON invalido", () => {
    expect(() => parseEnhanceResponse("nao eh json", { maxContextual: 3 })).toThrow(EnhanceChipsError);
  });

  it("lanca EnhanceChipsError quando cleanMessage vazio", () => {
    const raw = JSON.stringify({ cleanMessage: "", chips: ["a"], chipsSource: "contextual" });
    expect(() => parseEnhanceResponse(raw, { maxContextual: 3 })).toThrow(EnhanceChipsError);
  });

  it("lanca EnhanceChipsError quando chips vazio apos filtro", () => {
    const raw = JSON.stringify({ cleanMessage: "x", chips: [], chipsSource: "contextual" });
    expect(() => parseEnhanceResponse(raw, { maxContextual: 3 })).toThrow(EnhanceChipsError);
  });
});
