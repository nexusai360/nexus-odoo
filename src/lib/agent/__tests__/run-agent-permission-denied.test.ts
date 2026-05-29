// RBAC v2 (SPEC §6.2): teste de integracao do fast-path de recusa SEM LLM.
// viewer com acesso a {estoque} pergunta sobre financeiro -> nao chama o LLM,
// persiste o par de mensagens, gera audit_log e marca a decisao do router
// com outcome "permission_denied".

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
  prisma.userDomainAccess.findMany.mockResolvedValue([{ domain: "estoque" }]);
  prisma.message.create.mockResolvedValue({});
  prisma.conversation.findUnique.mockResolvedValue({ id: "conv-1", userId: "user-1" });
  prisma.auditLog.create.mockResolvedValue({});
  prisma.agentRouterDecision.create.mockResolvedValue({ id: "dec-1" });
  prisma.agentRouterDecision.update.mockResolvedValue({});

  getActiveLlmConfig.mockResolvedValue({
    provider: "anthropic",
    model: "claude-sonnet-4-7",
    apiKey: "test-key",
  });

  pickDomains.mockResolvedValue({
    pickedDomains: ["financeiro"],
    scores: { financeiro: 0.9 },
    topScore: 0.9,
    fallback: { triggered: false },
    pickDurationMs: 10,
    routerVersion: "r1.0.0-test",
  });
});

describe("RBAC v2 fast-path: recusa sem LLM", () => {
  test("viewer com {estoque} pergunta financeiro -> recusa sem chamar LLM", async () => {
    createMcpSession.mockResolvedValue(makeMcpSession());

    const result = await runAgent({
      conversationId: "conv-1",
      userId: "user-1",
      userMessage: "Qual o saldo bancário da empresa?",
      channel: "in_app",
      isPlayground: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toContain("Vi que sua pergunta toca em Financeiro");
      expect(result.usage).toEqual({ tokensInput: 0, tokensOutput: 0, costUsd: 0 });
    }

    // LLM nunca foi construido nem chamado
    expect(buildLlmClient).not.toHaveBeenCalled();

    // par user + assistant persistido
    expect(prisma.message.create).toHaveBeenCalledTimes(2);
    const roles = prisma.message.create.mock.calls.map(
      (c: any[]) => c[0].data.role,
    );
    expect(roles).toEqual(["user", "assistant"]);

    // auditoria da recusa
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe(
      "agent_permission_denied",
    );

    // outcome marcado na decisao do router
    expect(prisma.agentRouterDecision.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "dec-1" },
        data: expect.objectContaining({ outcome: "permission_denied" }),
      }),
    );
  });
});
