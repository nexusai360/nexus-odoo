// RBAC v2 (SPEC §6.6): caminho feliz. viewer com acesso a {financeiro}
// pergunta sobre financeiro -> fast-path NAO dispara, o LLM e chamado
// normalmente e a tool de financeiro segue no catalogo entregue.

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

function makeMcpSession() {
  return {
    listTools: jest.fn().mockResolvedValue([
      { name: "financeiro_saldo_bancario", description: "Saldo", inputSchema: { type: "object", properties: {} } },
      { name: "estoque_saldo_produto", description: "Estoque", inputSchema: { type: "object", properties: {} } },
    ]),
    callTool: jest.fn().mockResolvedValue("resultado"),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue({ id: "user-1", platformRole: "viewer", isActive: true });
  prisma.userDomainAccess.findMany.mockResolvedValue([{ domain: "financeiro" }]);
  prisma.message.create.mockResolvedValue({});
  prisma.conversation.findUnique.mockResolvedValue({ id: "conv-1", userId: "user-1" });
  prisma.auditLog.create.mockResolvedValue({});
  prisma.agentRouterDecision.create.mockResolvedValue({ id: "dec-1" });
  prisma.agentRouterDecision.update.mockResolvedValue({});

  getActiveLlmConfig.mockResolvedValue({ provider: "anthropic", model: "claude-sonnet-4-7", apiKey: "test-key" });

  pickDomains.mockResolvedValue({
    pickedDomains: ["financeiro"],
    scores: { financeiro: 0.9 },
    topScore: 0.9,
    fallback: { triggered: false },
    pickDurationMs: 10,
    routerVersion: "r1.0.0-test",
  });
});

describe("RBAC v2 caminho feliz: dominio permitido", () => {
  test("viewer com {financeiro} pergunta financeiro -> LLM chamado normalmente", async () => {
    const client = {
      provider: "anthropic" as const,
      model: "claude-sonnet-4-7",
      chat: jest.fn().mockResolvedValue({ message: "O saldo é R$ 100.", toolCalls: [], usage: { tokensInput: 10, tokensOutput: 5 } }),
    };
    buildLlmClient.mockReturnValue(client);
    createMcpSession.mockResolvedValue(makeMcpSession());

    const result = await runAgent({
      conversationId: "conv-1",
      userId: "user-1",
      userMessage: "Qual o saldo bancário?",
      channel: "in_app",
      isPlayground: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toBe("O saldo é R$ 100.");
    }

    // LLM efetivamente chamado (sem recusa).
    expect(buildLlmClient).toHaveBeenCalledTimes(1);
    expect(client.chat).toHaveBeenCalled();

    // Sem auditoria de recusa.
    expect(prisma.auditLog.create).not.toHaveBeenCalled();

    // A tool de financeiro foi entregue ao LLM no catalogo (camada B nao corta).
    const toolsArg = client.chat.mock.calls[0][0].tools as Array<{ name: string }>;
    expect(toolsArg.some((t) => t.name === "financeiro_saldo_bancario")).toBe(true);
  });
});
