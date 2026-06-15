// RBAC v2 (SPEC §6.3): defesa em profundidade contra alucinacao de tool.
// viewer com acesso a {estoque}; o router NAO recusa (fast-path nao dispara
// porque a pergunta cai em estoque). O LLM, porem, alucina e chama uma tool
// de financeiro fora do catalogo. run-agent NAO executa a tool: devolve um
// tool_result de erro semantico que o LLM ve na proxima iteracao.

import { runAgent } from "../run-agent";

/* eslint-disable @typescript-eslint/no-explicit-any */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    message: { create: jest.fn() },
    conversation: { findUnique: jest.fn() },
    agentSettings: { findUnique: jest.fn().mockResolvedValue(null) },
    userDomainAccess: { findMany: jest.fn() },
    auditLog: { create: jest.fn() },
    agentRouterDecision: { create: jest.fn(), update: jest.fn() },
  },
}));

jest.mock("../mcp-client", () => ({
  createMcpSession: jest.fn(),
  mcpToolsToProviderTools: jest.fn((tools: any[]) =>
    tools.map((t) => ({ name: t.name, description: t.description, parameters: t.inputSchema })),
  ),
}));

jest.mock("../external-mcp", () => ({
  openExternalMcpSessions: jest.fn().mockResolvedValue(null),
  callExternalTool: jest.fn(),
  isExternalToolName: (name: string) => name.startsWith("ext__"),
}));

jest.mock("../router/pick-domains", () => ({
  pickDomains: jest.fn(),
}));

jest.mock("../llm/get-active-config", () => ({
  getActiveLlmConfig: jest.fn(),
}));

jest.mock("../llm/get-client", () => ({
  buildLlmClient: jest.fn(),
}));

jest.mock("../llm/usage-logger", () => ({
  logUsage: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../conversation", () => ({
  loadHistory: jest.fn().mockResolvedValue([]),
  loadJanelaTurnos: jest.fn().mockResolvedValue({ mensagens: [], digestsAnteriores: [] }),
  persistMessage: jest.fn().mockResolvedValue(undefined),
  persistMessageAndReturnId: jest.fn().mockResolvedValue("msg-mock-id"),
  assertConversationOwned: jest.fn().mockResolvedValue(undefined),
  sanitizeHistoryPairs: jest.fn((h: unknown[]) => h),
  loadConversationReasoningHistory: jest.fn().mockResolvedValue([]),
  saveConversationReasoningHistory: jest.fn().mockResolvedValue(undefined),
  capReasoningHistory: jest.fn((h: unknown[]) => h),
  persistAssistantMessageWithTools: jest.fn().mockResolvedValue("msg-mock-id"),
  updateMessageToolResults: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../prompt/compose", () => ({
  composeSystemPrompt: jest.fn(() => "System prompt do agente."),
}));

jest.mock("../rag/search", () => ({
  searchKb: jest.fn().mockResolvedValue([]),
}));

jest.mock("../rag/embed", () => ({
  EmbeddingUnavailable: class EmbeddingUnavailable extends Error {},
}));

const { prisma } = jest.requireMock("@/lib/prisma") as any;
const { createMcpSession } = jest.requireMock("../mcp-client") as any;
const { pickDomains } = jest.requireMock("../router/pick-domains") as any;
const { getActiveLlmConfig } = jest.requireMock("../llm/get-active-config") as any;
const { buildLlmClient } = jest.requireMock("../llm/get-client") as any;

function makeClient(
  responses: Array<{ message: string; toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }> }>,
) {
  let callCount = 0;
  return {
    provider: "anthropic" as const,
    model: "claude-sonnet-4-7",
    chat: jest.fn().mockImplementation(async () => {
      const resp = responses[callCount] ?? responses[responses.length - 1];
      callCount++;
      return { message: resp.message, toolCalls: resp.toolCalls ?? [], usage: { tokensInput: 100, tokensOutput: 50 } };
    }),
  };
}

function makeMcpSession() {
  return {
    listTools: jest.fn().mockResolvedValue([
      { name: "estoque_saldo_produto", description: "Estoque", inputSchema: { type: "object", properties: {} } },
      { name: "financeiro_saldo_bancario", description: "Saldo", inputSchema: { type: "object", properties: {} } },
    ]),
    callTool: jest.fn().mockResolvedValue("resultado real"),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue({ id: "user-1", platformRole: "viewer", isActive: true });
  prisma.userDomainAccess.findMany.mockResolvedValue([{ domain: "estoque" }]);
  prisma.message.create.mockResolvedValue({});
  prisma.conversation.findUnique.mockResolvedValue({ id: "conv-1", userId: "user-1" });
  prisma.auditLog.create.mockResolvedValue({});
  prisma.agentRouterDecision.create.mockResolvedValue({ id: "dec-1" });
  prisma.agentRouterDecision.update.mockResolvedValue({});

  getActiveLlmConfig.mockResolvedValue({ provider: "anthropic", model: "claude-sonnet-4-7", apiKey: "test-key" });

  // Router casa em estoque (dominio permitido) -> fast-path NAO dispara.
  pickDomains.mockResolvedValue({
    pickedDomains: ["estoque"],
    scores: { estoque: 0.9 },
    topScore: 0.9,
    fallback: { triggered: false },
    pickDurationMs: 10,
    routerVersion: "r1.0.0-test",
  });
});

describe("RBAC v2 defesa §6.3: alucinacao de tool", () => {
  test("LLM chuta tool de financeiro -> nao executa, devolve erro semantico", async () => {
    const client = makeClient([
      { message: "Vou verificar...", toolCalls: [{ id: "tc1", name: "financeiro_saldo_bancario", arguments: {} }] },
      { message: "Não tenho acesso ao financeiro." },
    ]);
    buildLlmClient.mockReturnValue(client);
    const session = makeMcpSession();
    createMcpSession.mockResolvedValue(session);

    const result = await runAgent({
      conversationId: "conv-1",
      userId: "user-1",
      userMessage: "Quantas bicicletas tem em estoque?",
      channel: "in_app",
      isPlayground: false,
    });

    expect(result.ok).toBe(true);

    // A tool de financeiro NUNCA foi executada.
    expect(session.callTool).not.toHaveBeenCalledWith("financeiro_saldo_bancario", expect.anything());

    // A segunda iteracao recebeu um tool_result com a recusa de dominio.
    const secondCallMessages = client.chat.mock.calls[1][0].messages as Array<{ role: string; content: string }>;
    const toolMsg = secondCallMessages.find((m) => m.role === "tool");
    expect(toolMsg).toBeDefined();
    expect(toolMsg!.content).toContain("não está liberado");
  });
});
