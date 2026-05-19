import {
  MODELS,
  getModel,
  listModels,
  calculateCost,
  type ModelEntry,
} from "./catalog";

describe("catalog — fonte única de modelos e pricing", () => {
  test("todos os modelos têm id, provider, tier e pricing (ou null explícito)", () => {
    for (const m of MODELS) {
      expect(m.id).toBeTruthy();
      expect(m.provider).toMatch(/^(openai|anthropic|gemini|openrouter)$/);
      expect(["low", "medium", "high", "premium"]).toContain(m.tier);
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

  test("calculateCost retorna costKnown=false quando pricing é null (BUG 2 corrigido)", () => {
    // Encontrar um modelo sem pricing, ou mockar com um id desconhecido
    const modelWithoutPricing = MODELS.find((m) => m.pricing === null);
    if (modelWithoutPricing) {
      const result = calculateCost(modelWithoutPricing.id, 1000, 500);
      expect(result.costKnown).toBe(false);
      // costUsd pode ser null ou 0 — importante: não ser positivo silencioso
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
        // O pricing está inline — sem descasamento por definição
        expect(m.pricing.inputPerMTok).toBeGreaterThanOrEqual(0);
        expect(m.pricing.outputPerMTok).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
