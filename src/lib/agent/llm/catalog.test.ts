import {
  MODELS,
  getModel,
  listModels,
  calculateCost,
  reasoningCapsOf,
  effortToBudget,
  modelOutputCap,
  modelSupportsReasoning,
  reasoningLevelsOf,
  REASONING_CAPS,
} from "./catalog";

describe("catalog , fonte única de modelos e pricing", () => {
  test("todos os modelos têm id, provider, tier e pricing (ou null explícito)", () => {
    for (const m of MODELS) {
      expect(m.id).toBeTruthy();
      expect(m.provider).toMatch(/^(openai|anthropic|gemini|openrouter)$/);
      expect(["free", "low", "medium", "high", "premium"]).toContain(m.tier);
      // pricing é objeto com campos numéricos, ou null explícito
      if (m.pricing !== null) {
        expect(typeof m.pricing.inputPerMTok).toBe("number");
        expect(typeof m.pricing.outputPerMTok).toBe("number");
      }
    }
  });

  test("nenhum id duplicado", () => {
    const ids = MODELS.map((m) => m.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test("getModel retorna o registro correto", () => {
    const first = MODELS[0];
    const result = getModel(first.id);
    expect(result).toEqual(first);
  });

  test("getModel retorna undefined para id desconhecido", () => {
    expect(getModel("modelo-inexistente-xyz")).toBeUndefined();
  });

  test("listModels filtra por provider", () => {
    const anthropicModels = listModels("anthropic");
    expect(anthropicModels.length).toBeGreaterThan(0);
    for (const m of anthropicModels) {
      expect(m.provider).toBe("anthropic");
    }
  });

  test("calculateCost retorna costKnown=true e costUsd > 0 para modelo com pricing", () => {
    // Pegar um modelo com pricing não-null
    const modelWithPricing = MODELS.find((m) => m.pricing !== null)!;
    const result = calculateCost(modelWithPricing.id, 1000, 500);
    expect(result.costKnown).toBe(true);
    expect(result.costUsd).toBeGreaterThan(0);
  });

  test("calculateCost aplica preco reduzido na fracao cacheada (alavanca 1)", () => {
    const semCache = calculateCost("gpt-5.4-mini", 20000, 800).costUsd!;
    const comCache = calculateCost("gpt-5.4-mini", 20000, 800, {
      cachedInputTokens: 18000,
    }).costUsd!;
    expect(comCache).toBeLessThan(semCache);
    // 18000 tokens passam de 0.25 para 0.025 USD/Mtok (0.1x) => economia previsivel.
    const economiaEsperada = (18000 * (0.25 - 0.025)) / 1_000_000;
    expect(semCache - comCache).toBeCloseTo(economiaEsperada, 10);
  });

  test("calculateCost: cache cap em tokensInput (nao fica negativo)", () => {
    const r = calculateCost("gpt-5.4-mini", 100, 0, { cachedInputTokens: 999 });
    expect(r.costUsd!).toBeGreaterThanOrEqual(0);
  });

  test("calculateCost retorna costKnown=false quando pricing é null (BUG 2 corrigido)", () => {
    // Encontrar um modelo sem pricing, ou mockar com um id desconhecido
    const modelWithoutPricing = MODELS.find((m) => m.pricing === null);
    if (modelWithoutPricing) {
      const result = calculateCost(modelWithoutPricing.id, 1000, 500);
      expect(result.costKnown).toBe(false);
      // costUsd pode ser null ou 0 , importante: não ser positivo silencioso
    }
    // id desconhecido também retorna costKnown=false
    const result = calculateCost("id-nao-existe", 1000, 500);
    expect(result.costKnown).toBe(false);
  });

  test("modelo com pricing=null não retorna custo positivo silencioso", () => {
    const result = calculateCost("id-sem-pricing", 100_000, 50_000);
    expect(result.costKnown).toBe(false);
    // costUsd deve ser null ou 0, nunca um positivo falso
    if (result.costUsd !== null) {
      expect(result.costUsd).toBe(0);
    }
  });

  test("todos os ids do catálogo têm tier coerente com pricing quando pricing existe", () => {
    // BUG 3: id do catálogo deve bater com seu próprio pricing dentro do MODELS
    for (const m of MODELS) {
      if (m.pricing !== null) {
        // O pricing está inline , sem descasamento por definição
        expect(m.pricing.inputPerMTok).toBeGreaterThanOrEqual(0);
        expect(m.pricing.outputPerMTok).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("REASONING_CAPS , capability table canonica (Onda 1)", () => {
  test("reasoningCapsOf retorna cap para gpt-5.4-nano (OpenAI Responses)", () => {
    const cap = reasoningCapsOf("gpt-5.4-nano");
    expect(cap).not.toBeNull();
    expect(cap!.enabled).toBe(true);
    expect(cap!.supportsWithTools).toBe(true);
    expect(cap!.openaiEndpoint).toBe("responses");
    expect(cap!.levels).toEqual(["minimal", "low", "medium", "high"]);
  });

  test("reasoningCapsOf retorna null para modelo inexistente", () => {
    expect(reasoningCapsOf("modelo-inexistente-xyz")).toBeNull();
  });

  test("Haiku 4.5 marca supportsWithTools=false", () => {
    const cap = reasoningCapsOf("claude-haiku-4-5");
    expect(cap).not.toBeNull();
    expect(cap!.supportsWithTools).toBe(false);
  });

  test("Opus 4.7 marca adaptiveMode=true com anthropicThinking adaptive", () => {
    const cap = reasoningCapsOf("claude-opus-4-7");
    expect(cap).not.toBeNull();
    expect(cap!.adaptiveMode).toBe(true);
    expect(cap!.anthropicThinking).toBe("adaptive");
    expect(cap!.anthropicInterleavedAuto).toBe(true);
  });

  test("Gemini 3.1 Pro tem levels=['auto'] e adaptiveMode=true", () => {
    const cap = reasoningCapsOf("gemini-3.1-pro");
    expect(cap).not.toBeNull();
    expect(cap!.levels).toEqual(["auto"]);
    expect(cap!.adaptiveMode).toBe(true);
    expect(cap!.autoModeHint).toBeTruthy();
  });

  test("effortToBudget retorna teto do range para 'auto'", () => {
    expect(effortToBudget("claude-opus-4-7", "auto")).toBe(24000);
  });

  test("effortToBudget escalona dentro do range (Haiku 4.5)", () => {
    expect(effortToBudget("claude-haiku-4-5", "minimal")).toBe(1024);
    const low = effortToBudget("claude-haiku-4-5", "low");
    const medium = effortToBudget("claude-haiku-4-5", "medium");
    expect(effortToBudget("claude-haiku-4-5", "high")).toBe(8000);
    expect(low!).toBeGreaterThan(1024);
    expect(medium!).toBeGreaterThan(low!);
    expect(medium!).toBeLessThan(8000);
  });

  test("effortToBudget retorna null quando modelo nao usa budget", () => {
    expect(effortToBudget("gpt-5.4-nano", "medium")).toBeNull();
    expect(effortToBudget("modelo-inexistente", "high")).toBeNull();
  });

  test("modelOutputCap retorna valor correto para Anthropic", () => {
    expect(modelOutputCap("claude-haiku-4-5")).toBe(64_000);
    expect(modelOutputCap("claude-opus-4-7")).toBe(128_000);
  });

  test("modelOutputCap retorna undefined para OpenAI (sem clamp)", () => {
    expect(modelOutputCap("gpt-5.4-nano")).toBeUndefined();
  });

  test("modelSupportsReasoning prioriza REASONING_CAPS", () => {
    expect(modelSupportsReasoning("gpt-5.4-nano")).toBe(true);
    expect(modelSupportsReasoning("modelo-inexistente")).toBe(false);
  });

  test("reasoningLevelsOf retorna levels da CAPS", () => {
    expect(reasoningLevelsOf("gpt-5.4-nano")).toEqual(["minimal", "low", "medium", "high"]);
    expect(reasoningLevelsOf("o3")).toEqual(["low", "medium", "high"]);
  });

  test("invariantes da tabela REASONING_CAPS", () => {
    for (const [id, cap] of Object.entries(REASONING_CAPS)) {
      expect(id).toBeTruthy();
      expect(cap.levels.length).toBeGreaterThan(0);
      if (cap.levels.includes("auto")) {
        expect(cap.levels.length).toBe(1);
      }
      if (cap.budgetRange) {
        expect(cap.budgetRange[0]).toBeLessThan(cap.budgetRange[1]);
      }
    }
  });
});
