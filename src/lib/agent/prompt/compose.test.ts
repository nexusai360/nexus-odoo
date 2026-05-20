import { composeSystemPrompt } from "./compose";
import type { AgentPromptConfig, KbDocSnippet } from "./compose";

const baseConfig: AgentPromptConfig = {
  identityBase: null,
  personality: "",
  tone: "",
  guardrails: [],
  advancedOverride: null,
  kbEnabled: false,
  terminology: {},
  suggestionsEnabled: false,
};

describe("composeSystemPrompt", () => {
  test("advancedOverride preenchido → retorna só o override", () => {
    const cfg: AgentPromptConfig = {
      ...baseConfig,
      advancedOverride: "Prompt completamente customizado.",
    };
    const result = composeSystemPrompt(cfg, []);
    expect(result).toBe("Prompt completamente customizado.");
  });

  test("sem override → começa com IDENTITY_BASE", () => {
    const result = composeSystemPrompt(baseConfig, []);
    expect(result).toContain("Matrix Fitness Group");
    expect(result).toContain("Odoo");
  });

  test("identityBase do DB tem prioridade sobre hardcoded", () => {
    const cfg: AgentPromptConfig = {
      ...baseConfig,
      identityBase: "Identidade personalizada do banco.",
    };
    const result = composeSystemPrompt(cfg, []);
    expect(result).toContain("Identidade personalizada do banco.");
    expect(result).not.toContain("Matrix Fitness Group");
  });

  test("personality → injeta bloco [PERSONALIDADE]", () => {
    const cfg: AgentPromptConfig = { ...baseConfig, personality: "Amigável e objetivo." };
    const result = composeSystemPrompt(cfg, []);
    expect(result).toContain("[PERSONALIDADE]");
    expect(result).toContain("Amigável e objetivo.");
  });

  test("tone → injeta bloco [TOM]", () => {
    const cfg: AgentPromptConfig = { ...baseConfig, tone: "Formal e técnico." };
    const result = composeSystemPrompt(cfg, []);
    expect(result).toContain("[TOM]");
    expect(result).toContain("Formal e técnico.");
  });

  test("guardrails → injeta bloco [GUARDRAILS]", () => {
    const cfg: AgentPromptConfig = {
      ...baseConfig,
      guardrails: ["Não inventar dados.", "Nunca revelar API keys."],
    };
    const result = composeSystemPrompt(cfg, []);
    expect(result).toContain("[GUARDRAILS]");
    expect(result).toContain("- Não inventar dados.");
    expect(result).toContain("- Nunca revelar API keys.");
  });

  test("KB habilitada e com docs → injeta conteúdo", () => {
    const cfg: AgentPromptConfig = { ...baseConfig, kbEnabled: true };
    const docs: KbDocSnippet[] = [
      { name: "Manual.pdf", extractedText: "Conteúdo do manual de operações." },
    ];
    const result = composeSystemPrompt(cfg, docs);
    expect(result).toContain("[BASE DE CONHECIMENTO]");
    expect(result).toContain("Manual.pdf");
    expect(result).toContain("Conteúdo do manual de operações.");
  });

  test("KB desabilitada → não injeta docs mesmo quando fornecidos", () => {
    const cfg: AgentPromptConfig = { ...baseConfig, kbEnabled: false };
    const docs: KbDocSnippet[] = [
      { name: "Segredo.pdf", extractedText: "Dados que não devem aparecer." },
    ];
    const result = composeSystemPrompt(cfg, docs);
    expect(result).not.toContain("[BASE DE CONHECIMENTO]");
    expect(result).not.toContain("Segredo.pdf");
  });

  test("KB com doc grande → trunca e adiciona marker", () => {
    const cfg: AgentPromptConfig = { ...baseConfig, kbEnabled: true };
    // Cap da KB é 50.000 chars — doc maior é truncado.
    const bigText = "x".repeat(60_000);
    const docs: KbDocSnippet[] = [{ name: "Grande.txt", extractedText: bigText }];
    const result = composeSystemPrompt(cfg, docs);
    expect(result).toContain("[...truncado...]");
    // Resultado total não deve explodir o prompt.
    expect(result.length).toBeLessThan(75_000);
  });

  test("terminology → injeta bloco Terminologia", () => {
    const cfg: AgentPromptConfig = {
      ...baseConfig,
      terminology: { PDV: "Ponto de Venda", SKU: "Código de produto" },
    };
    const result = composeSystemPrompt(cfg, []);
    expect(result).toContain("## Terminologia");
    expect(result).toContain('"PDV" → Ponto de Venda');
  });

  test("suggestionsEnabled → injeta instrução de [[suggestions]]", () => {
    const cfg: AgentPromptConfig = { ...baseConfig, suggestionsEnabled: true };
    const result = composeSystemPrompt(cfg, []);
    expect(result).toContain("[[suggestions]]");
  });

  test("biSchema ausente → sem bloco de schema BI", () => {
    const result = composeSystemPrompt(baseConfig, []);
    expect(result).not.toContain("Schema para consulta avançada");
  });

  test("biSchema presente → injeta bloco de schema BI", () => {
    const biSchema = "CREATE TABLE fato_estoque_saldo (id INT);";
    const result = composeSystemPrompt(baseConfig, [], undefined, biSchema);
    expect(result).toContain("## Schema para consulta avançada (BI)");
    expect(result).toContain("CREATE TABLE fato_estoque_saldo");
  });

  test("biSchema com advancedOverride → override ignora biSchema", () => {
    const cfg: AgentPromptConfig = {
      ...baseConfig,
      advancedOverride: "Override total.",
    };
    const biSchema = "CREATE TABLE fato_estoque_saldo (id INT);";
    const result = composeSystemPrompt(cfg, [], undefined, biSchema);
    expect(result).toBe("Override total.");
    expect(result).not.toContain("Schema para consulta avançada");
  });
});
