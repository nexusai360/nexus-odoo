import { runAgent, extractSuggestions } from "./run-agent";

// Mocks de dependências
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    message: { create: jest.fn(), findMany: jest.fn() },
    conversation: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    agentSettings: { findUnique: jest.fn().mockResolvedValue(null) },
    // RBAC v2 camada B: o gate de dominio do run-agent consulta os dominios
    // concedidos. O fixture concede "estoque" para que o operator possa exercer
    // a tool de estoque dos testes de tool-calling.
    userDomainAccess: { findMany: jest.fn() },
  },
}));

jest.mock("./mcp-client", () => ({
  createMcpSession: jest.fn(),
  mcpToolsToProviderTools: jest.fn((tools) =>
    tools.map((t: { name: string; description: string; inputSchema: unknown }) => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    })),
  ),
}));

// MCPs externos: sem servidores no teste; o run usa só o MCP interno.
jest.mock("./external-mcp", () => ({
  openExternalMcpSessions: jest.fn().mockResolvedValue(null),
  callExternalTool: jest.fn(),
  isExternalToolName: (name: string) => name.startsWith("ext__"),
}));

jest.mock("./llm/get-active-config", () => ({
  getActiveLlmConfig: jest.fn(),
}));

jest.mock("./llm/get-client", () => ({
  buildLlmClient: jest.fn(),
}));

jest.mock("./llm/usage-logger", () => ({
  logUsage: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("./conversation", () => ({
  loadHistory: jest.fn().mockResolvedValue([]),
  persistMessage: jest.fn().mockResolvedValue(undefined),
  persistMessageAndReturnId: jest.fn().mockResolvedValue("msg-mock-id"),
  assertConversationOwned: jest.fn().mockResolvedValue(undefined),
  // sanitizeHistoryPairs: passthrough , retorna o array sem modificação nos testes
  sanitizeHistoryPairs: jest.fn((h: unknown[]) => h),
  // Onda 2: reasoning history helpers (mocks no-op para preservar testes existentes).
  loadConversationReasoningHistory: jest.fn().mockResolvedValue([]),
  saveConversationReasoningHistory: jest.fn().mockResolvedValue(undefined),
  capReasoningHistory: jest.fn((h: unknown[]) => h),
  // Onda 1 Inteligencia: tool-results persistence helpers.
  persistAssistantMessageWithTools: jest.fn().mockResolvedValue("msg-mock-id"),
  updateMessageToolResults: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("./prompt/compose", () => ({
  composeSystemPrompt: jest.fn(() => "System prompt do agente."),
}));

jest.mock("./bi-schema-reference", () => ({
  BI_SCHEMA_REFERENCE: "DDL das fact tables...",
}));

jest.mock("./rag/search", () => ({
  searchKb: jest.fn().mockResolvedValue([]),
}));

jest.mock("./rag/embed", () => ({
  EmbeddingUnavailable: class EmbeddingUnavailable extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "EmbeddingUnavailable";
    }
  },
}));

const { prisma } = jest.requireMock("@/lib/prisma");
const { createMcpSession } = jest.requireMock("./mcp-client");
const { getActiveLlmConfig } = jest.requireMock("./llm/get-active-config");
const { buildLlmClient } = jest.requireMock("./llm/get-client");

function makeClient(responses: Array<{ message: string; toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }> }>) {
  let callCount = 0;
  return {
    provider: "anthropic" as const,
    model: "claude-sonnet-4-7",
    chat: jest.fn().mockImplementation(async () => {
      const resp = responses[callCount] ?? responses[responses.length - 1];
      callCount++;
      return {
        message: resp.message,
        toolCalls: resp.toolCalls ?? [],
        usage: { tokensInput: 100, tokensOutput: 50 },
      };
    }),
  };
}

function makeMcpSession(toolResult = "Resultado da tool") {
  return {
    listTools: jest.fn().mockResolvedValue([
      {
        name: "estoque_saldo_produto",
        description: "Saldo de produto",
        inputSchema: { type: "object", properties: {} },
      },
    ]),
    callTool: jest.fn().mockResolvedValue(toolResult),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue({ id: "user-1", platformRole: "operator", isActive: true });
  prisma.userDomainAccess.findMany.mockResolvedValue([{ domain: "estoque" }]);
  prisma.message.create.mockResolvedValue({});
  prisma.message.findMany.mockResolvedValue([]);
  prisma.conversation.findUnique.mockResolvedValue({ id: "conv-1", userId: "user-1" });

  getActiveLlmConfig.mockResolvedValue({
    provider: "anthropic",
    model: "claude-sonnet-4-7",
    apiKey: "test-key",
  });
});

describe("extractSuggestions", () => {
  test("extrai sugestões do sufixo [[suggestions]]", () => {
    const text = "Saldo: 10 unidades.\n\n[[suggestions]]:Qual o custo?|Top movimentados?|Parados?";
    const { message, suggestions } = extractSuggestions(text);
    expect(suggestions).toHaveLength(3);
    expect(suggestions[0]).toBe("Qual o custo?");
    expect(message).not.toContain("[[suggestions]]");
  });

  test("sem sufixo → message intacta, suggestions usa fallback fatiado", () => {
    // Contrato novo (Onda C v3): quando o modelo esquece de emitir
    // [[suggestions]], extractSuggestions injeta o set FALLBACK_SUGGESTIONS
    // fatiado por maxCount para nao deixar a bolha sem chips na UI.
    const text = "Resposta sem sugestões.";
    const { message, suggestions } = extractSuggestions(text, 3);
    expect(message).toBe(text);
    expect(suggestions).toHaveLength(3);
    expect(suggestions.every((s) => typeof s === "string" && s.length > 0)).toBe(true);
  });

  test("sugestão com >80 chars é filtrada", () => {
    const longSugg = "a".repeat(81);
    const text = `Resposta.\n\n[[suggestions]]:Curta|${longSugg}`;
    const { suggestions } = extractSuggestions(text);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toBe("Curta");
  });

  test("remove markdown das sugestões (chips de texto puro)", () => {
    const text =
      "Resposta.\n\n[[suggestions]]:Quero o **preço de venda**|Custo do `PMB403`";
    const { suggestions } = extractSuggestions(text);
    expect(suggestions).toEqual(["Quero o preço de venda", "Custo do PMB403"]);
  });

  test("aceita até 7 sugestões (cap elevado para desambiguação)", () => {
    const text =
      "Resposta.\n\n[[suggestions]]:Um|Dois|Tres|Quatro|Cinco|Seis";
    const { suggestions } = extractSuggestions(text);
    expect(suggestions).toHaveLength(6);
    expect(suggestions).toEqual(["Um", "Dois", "Tres", "Quatro", "Cinco", "Seis"]);
  });
});

describe("runAgent", () => {
  test("resposta direta sem tool calls → retorna message", async () => {
    const client = makeClient([{ message: "O saldo é 10 unidades." }]);
    buildLlmClient.mockReturnValue(client);
    const session = makeMcpSession();
    createMcpSession.mockResolvedValue(session);

    const result = await runAgent({
      conversationId: "conv-1",
      userId: "user-1",
      userMessage: "Qual o saldo?",
      channel: "in_app",
      isPlayground: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toBe("O saldo é 10 unidades.");
    }
    expect(session.close).toHaveBeenCalled();
  });

  test("tool calling loop: executa tool e retorna resposta final", async () => {
    const client = makeClient([
      {
        message: "Vou verificar...",
        toolCalls: [{ id: "tc1", name: "estoque_saldo_produto", arguments: { produto: "Bicicleta" } }],
      },
      { message: "O saldo é 5 unidades." },
    ]);
    buildLlmClient.mockReturnValue(client);
    const session = makeMcpSession("Saldo: 5 unidades");
    createMcpSession.mockResolvedValue(session);

    const result = await runAgent({
      conversationId: "conv-1",
      userId: "user-1",
      userMessage: "Saldo de Bicicleta?",
      channel: "in_app",
      isPlayground: false,
    });

    expect(result.ok).toBe(true);
    expect(session.callTool).toHaveBeenCalledWith("estoque_saldo_produto", { produto: "Bicicleta" });
    expect(session.close).toHaveBeenCalled();
  });

  test("RBAC v2: admin (userAllowedDomains='all') executa tool sem crash na defesa §6.3", async () => {
    // Regressao: a defesa §6.3 faz `userAllowedDomains === "all" || ... || userAllowedDomains.has(d)`.
    // Para super_admin/admin (= "all") o short-circuit NAO pode chegar no .has()
    // (string nao tem .has). Este teste exercita o loop de tool com role "all".
    prisma.user.findUnique.mockResolvedValue({ id: "user-admin", platformRole: "admin", isActive: true });
    const client = makeClient([
      {
        message: "Vou verificar...",
        toolCalls: [{ id: "tc1", name: "financeiro_saldo_bancario", arguments: {} }],
      },
      { message: "Saldo conferido." },
    ]);
    buildLlmClient.mockReturnValue(client);
    const session = {
      listTools: jest.fn().mockResolvedValue([
        { name: "financeiro_saldo_bancario", description: "Saldo", inputSchema: { type: "object", properties: {} } },
      ]),
      callTool: jest.fn().mockResolvedValue("Saldo: R$ 0"),
      close: jest.fn().mockResolvedValue(undefined),
    };
    createMcpSession.mockResolvedValue(session);

    const result = await runAgent({
      conversationId: "conv-1",
      userId: "user-admin",
      userMessage: "Qual o saldo?",
      channel: "in_app",
      isPlayground: false,
    });

    expect(result.ok).toBe(true);
    // admin ve tudo: a tool de financeiro deve ser executada (sem TypeError).
    expect(session.callTool).toHaveBeenCalledWith("financeiro_saldo_bancario", {});
  });

  test("MAX_ITERATIONS excedido → retorna ok=false", async () => {
    // Tool calls sempre, nunca resposta final
    const client = makeClient([
      { message: "Loop...", toolCalls: [{ id: "tc1", name: "estoque_saldo_produto", arguments: {} }] },
    ]);
    buildLlmClient.mockReturnValue(client);
    const session = makeMcpSession("resultado");
    createMcpSession.mockResolvedValue(session);

    const result = await runAgent({
      conversationId: "conv-1",
      userId: "user-1",
      userMessage: "Pergunta que causa loop",
      channel: "in_app",
      isPlayground: false,
    });

    expect(result.ok).toBe(false);
    expect(session.close).toHaveBeenCalled();
  });

  test("resultado de tool grande é truncado (MAX_TOOL_RESULT_BYTES)", async () => {
    const bigResult = "x".repeat(30_000);
    const client = makeClient([
      { message: "...", toolCalls: [{ id: "tc1", name: "estoque_saldo_produto", arguments: {} }] },
      { message: "Resultado truncado processado." },
    ]);
    buildLlmClient.mockReturnValue(client);
    const session = makeMcpSession(bigResult);
    createMcpSession.mockResolvedValue(session);

    const result = await runAgent({
      conversationId: "conv-1",
      userId: "user-1",
      userMessage: "Pergunta com resultado grande",
      channel: "in_app",
      isPlayground: false,
    });

    expect(result.ok).toBe(true);
    // Verificar que o conteúdo passado ao LLM foi truncado
    const chatCalls = client.chat.mock.calls;
    const toolMessage = chatCalls[1][0].messages.find(
      (m: { role: string }) => m.role === "tool",
    );
    expect(toolMessage?.content.length).toBeLessThanOrEqual(24_600); // ~24576 + aviso
  });

  test("usuário admin → recebe biSchema no prompt (G7)", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "user-admin", platformRole: "admin", isActive: true });
    const client = makeClient([{ message: "Resposta admin." }]);
    buildLlmClient.mockReturnValue(client);
    createMcpSession.mockResolvedValue(makeMcpSession());

    const { composeSystemPrompt } = jest.requireMock("./prompt/compose");

    await runAgent({
      conversationId: "conv-1",
      userId: "user-admin",
      userMessage: "Pergunta admin",
      channel: "in_app",
      isPlayground: false,
    });

    expect(composeSystemPrompt).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      undefined,
      expect.stringContaining("DDL"),
      expect.any(String),
    );
  });

  test("sessão MCP é fechada mesmo em caso de erro", async () => {
    buildLlmClient.mockReturnValue({
      provider: "anthropic" as const,
      model: "claude-sonnet-4-7",
      chat: jest.fn().mockRejectedValue(new Error("LLM error")),
    });
    const session = makeMcpSession();
    createMcpSession.mockResolvedValue(session);

    const result = await runAgent({
      conversationId: "conv-1",
      userId: "user-1",
      userMessage: "Pergunta",
      channel: "in_app",
      isPlayground: false,
    });

    expect(result.ok).toBe(false);
    expect(session.close).toHaveBeenCalled();
  });

  test("KB habilitada → searchKb é chamado com a mensagem do usuário", async () => {
    prisma.agentSettings.findUnique.mockResolvedValue({
      id: "global",
      identityBase: null,
      personality: "",
      tone: "",
      guardrails: [],
      advancedOverride: null,
      kbEnabled: true,
      terminology: {},
      suggestionsEnabled: false,
    });
    const client = makeClient([{ message: "Resposta com KB." }]);
    buildLlmClient.mockReturnValue(client);
    createMcpSession.mockResolvedValue(makeMcpSession());

    const { searchKb } = jest.requireMock("./rag/search");
    searchKb.mockResolvedValue([{ id: "doc-1", name: "Doc", extractedText: "Conteúdo relevante." }]);

    await runAgent({
      conversationId: "conv-1",
      userId: "user-1",
      userMessage: "Pergunta sobre o doc",
      channel: "in_app",
      isPlayground: false,
    });

    expect(searchKb).toHaveBeenCalledWith("Pergunta sobre o doc", 5);
  });

  test("onEvent é chamado com eventos de progresso", async () => {
    const client = makeClient([{ message: "Resposta final." }]);
    buildLlmClient.mockReturnValue(client);
    createMcpSession.mockResolvedValue(makeMcpSession());

    const events: string[] = [];
    await runAgent({
      conversationId: "conv-1",
      userId: "user-1",
      userMessage: "Pergunta",
      channel: "in_app",
      isPlayground: false,
      onEvent: (evt) => events.push(evt.type),
    });

    expect(events.length).toBeGreaterThan(0);
  });
});
