import { composeSystemPrompt, IDENTITY_BASE } from "./compose";
import type { AgentPromptConfig, KbDocSnippet } from "./compose";
import { DEFAULT_GUARDRAILS } from "./defaults";

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
    // Cap da KB foi elevado para 500.000 chars; doc maior continua sendo
    // truncado com marker. Teste usa 600k para garantir overflow do cap.
    const bigText = "x".repeat(600_000);
    const docs: KbDocSnippet[] = [{ name: "Grande.txt", extractedText: bigText }];
    const result = composeSystemPrompt(cfg, docs);
    expect(result).toContain("[...truncado...]");
    // Resultado total nao deve explodir o prompt acima de uma folga sobre o cap.
    expect(result.length).toBeLessThan(550_000);
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

describe("IDENTITY_BASE , melhorias de comportamento do Agente Nex", () => {
  test("traz a política de desambiguação com exemplos", () => {
    expect(IDENTITY_BASE).toContain("[DESAMBIGUAÇÃO]");
    expect(IDENTITY_BASE.toLowerCase()).toContain("pergunte de volta");
    expect(IDENTITY_BASE).toContain("Exemplo 1");
  });

  test("não pede mais o selo de atualização e manda ignorar o carimbo", () => {
    expect(IDENTITY_BASE).not.toContain("Sempre inclua o timestamp");
    expect(IDENTITY_BASE.toLowerCase()).toContain("ignore esse carimbo");
  });

  test("abre exceção de concisão para desambiguação e listas", () => {
    expect(IDENTITY_BASE).toContain(
      "mensagens de desambiguação e listas podem ser mais longas",
    );
  });

  test("traz o bloco de segurança da informação", () => {
    expect(IDENTITY_BASE).toContain("## Segurança da informação");
    expect(IDENTITY_BASE.toLowerCase()).toContain("chave de api");
  });

  test("orienta formatação humanizada com negrito", () => {
    expect(IDENTITY_BASE.toLowerCase()).toContain("negrito");
  });
});

describe("DEFAULT_GUARDRAILS , segurança da informação", () => {
  test("bloqueia perguntas sobre arquitetura e chave de API", () => {
    const joined = DEFAULT_GUARDRAILS.join(" ").toLowerCase();
    expect(joined).toContain("arquitetura");
    expect(joined).toContain("chave de api");
  });
});

describe("composeSystemPrompt , sugestoes de desambiguacao", () => {
  test("instrucao de sugestoes cobre desambiguacao e o cap configuravel", () => {
    const out = composeSystemPrompt(
      { ...baseConfig, suggestionsEnabled: true, maxSuggestions: 3 },
      [],
    );
    expect(out).toContain("desambiguacao");
    // O texto traz o limite configurado dinamicamente em pelo menos dois pontos.
    expect(out).toContain("ate **3 sugestoes**");
    expect(out).toContain("maximo esta configurado em 3");
  });

  test("respeita maxSuggestions configurado", () => {
    const out = composeSystemPrompt(
      { ...baseConfig, suggestionsEnabled: true, maxSuggestions: 5 },
      [],
    );
    expect(out).toContain("ate **5 sugestoes**");
    expect(out).not.toContain("ate **3 sugestoes**");
  });

  test("source=suggestion injeta diretiva de resposta direta", () => {
    const out = composeSystemPrompt(
      { ...baseConfig, suggestionsEnabled: true },
      [],
      undefined,
      undefined,
      "suggestion",
    );
    expect(out).toContain("Entrada veio de sugestao clicada");
    expect(out).toContain("Responda direto");
  });

  test("bloco Comportamento adiciona defaults razoaveis e limite de clarificacao", () => {
    const out = composeSystemPrompt({ ...baseConfig }, []);
    expect(out).toContain("## Comportamento");
    expect(out).toContain("mes do calendario corrente");
    expect(out).toContain("Nao faca mais de uma rodada de clarificacao");
  });

  test("diretriz datasets grandes: aparece e e pragmatica (sem forcar loop)", () => {
    const out = composeSystemPrompt({ ...baseConfig }, []);
    expect(out).toContain("Diretriz de resposta para datasets grandes");
    // Preferencia, nao obrigacao agressiva.
    expect(out).toContain("prefira responder com um QUANTITATIVO direto");
    expect(out).toContain("Evite a pergunta");
    // Guardrail contra loop.
    expect(out).toContain("LIMITE DE TOOLS POR TURNO");
    expect(out).toContain("nao faca mais de 3 chamadas");
  });

  test("diretriz aparece NO FINAL do prompt (recency bias)", () => {
    const out = composeSystemPrompt({ ...baseConfig }, []);
    const idxComportamento = out.indexOf("## Comportamento");
    const idxRegra = out.indexOf("Diretriz de resposta para datasets grandes");
    expect(idxComportamento).toBeGreaterThanOrEqual(0);
    expect(idxRegra).toBeGreaterThan(idxComportamento);
    const outFull = composeSystemPrompt(
      { ...baseConfig, personality: "X", tone: "Y", guardrails: ["Z"] },
      [],
    );
    const idxRegraFull = outFull.indexOf("Diretriz de resposta para datasets grandes");
    expect(idxRegraFull).toBeGreaterThan(outFull.indexOf("[GUARDRAILS]"));
  });

  test("diretriz sobrevive a identity_base customizado (do DB)", () => {
    const out = composeSystemPrompt(
      { ...baseConfig, identityBase: "Identidade totalmente customizada do admin." },
      [],
    );
    expect(out).toContain("Identidade totalmente customizada do admin.");
    expect(out).toContain("Diretriz de resposta para datasets grandes");
  });

  test("advancedOverride SHORT-CIRCUITA tudo (poder total do admin)", () => {
    // Decisao de design preexistente: quando admin usa advancedOverride,
    // ele assume responsabilidade pelo prompt inteiro. Nem a regra de
    // quantitativo nem o Comportamento sao appendados. Documentar.
    const out = composeSystemPrompt(
      { ...baseConfig, advancedOverride: "Prompt totalmente customizado." },
      [],
    );
    expect(out).toBe("Prompt totalmente customizado.");
    expect(out).not.toContain("Resultados grandes");
  });
});
