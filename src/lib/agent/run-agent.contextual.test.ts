/**
 * R2-ctx: teste de integração do roteamento contextual (3 camadas) no runAgent.
 * Mocka o motor do router (pick-domains), a reformulação (contextualize), o
 * resolver de LLM e o log de decisão, para exercer só a orquestração das
 * camadas + a checagem RBAC sobre a decisão FINAL.
 */

import { runAgent } from "./run-agent";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    message: { create: jest.fn(), findMany: jest.fn() },
    conversation: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    agentSettings: { findUnique: jest.fn() },
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
jest.mock("./external-mcp", () => ({
  openExternalMcpSessions: jest.fn().mockResolvedValue(null),
  callExternalTool: jest.fn(),
  isExternalToolName: (name: string) => name.startsWith("ext__"),
}));
jest.mock("./llm/get-active-config", () => ({ getActiveLlmConfig: jest.fn() }));
jest.mock("./llm/get-client", () => ({ buildLlmClient: jest.fn() }));
jest.mock("./llm/usage-logger", () => ({ logUsage: jest.fn().mockResolvedValue(undefined) }));
jest.mock("./conversation", () => ({
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
jest.mock("./prompt/compose", () => ({ composeSystemPrompt: jest.fn(() => "System prompt.") }));
jest.mock("./bi-schema-reference", () => ({
  BI_SCHEMA_REFERENCE: "DDL...",
  biSchemaReference: jest.fn(() => "REGRA DO CORTE + DDL..."),
}));
jest.mock("./rag/search", () => ({ searchKb: jest.fn().mockResolvedValue([]) }));
jest.mock("./rag/embed", () => ({
  EmbeddingUnavailable: class EmbeddingUnavailable extends Error {},
}));

// Router: mockamos motor + reformulação + resolver + log para controlar o fluxo.
jest.mock("./router/pick-domains", () => ({ pickDomains: jest.fn() }));
jest.mock("./router/contextualize", () => ({ reformulateQuestion: jest.fn() }));
jest.mock("./router/get-reform-config", () => ({ resolveReformLlm: jest.fn() }));
jest.mock("./router/log-decision", () => ({
  createDecision: jest.fn().mockResolvedValue({ decisionId: "dec-1", persisted: true }),
  updateDecision: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("./permission-denial", () => ({
  respondPermissionDenied: jest.fn().mockResolvedValue({ ok: true, message: "Sem acesso." }),
}));

const { prisma } = jest.requireMock("@/lib/prisma");
const { createMcpSession } = jest.requireMock("./mcp-client");
const { getActiveLlmConfig } = jest.requireMock("./llm/get-active-config");
const { buildLlmClient } = jest.requireMock("./llm/get-client");
const { pickDomains } = jest.requireMock("./router/pick-domains");
const { reformulateQuestion } = jest.requireMock("./router/contextualize");
const { resolveReformLlm } = jest.requireMock("./router/get-reform-config");
const { createDecision } = jest.requireMock("./router/log-decision");
const { respondPermissionDenied } = jest.requireMock("./permission-denial");

const ROUTER_VERSION = "r1.0.0-test";
function fallbackDecision() {
  return { pickedDomains: [], scores: {}, topScore: null, fallback: { triggered: true, reason: "score_baixo" }, pickDurationMs: 1, routerVersion: ROUTER_VERSION };
}
function domainDecision(domains: string[]) {
  return { pickedDomains: domains, scores: {}, topScore: 0.6, fallback: { triggered: false }, pickDurationMs: 1, routerVersion: ROUTER_VERSION };
}
function makeClient(message: string) {
  return {
    provider: "anthropic" as const,
    model: "claude-sonnet-4-7",
    chat: jest.fn().mockResolvedValue({ message, toolCalls: [], usage: { tokensInput: 10, tokensOutput: 5 } }),
  };
}
function makeSession() {
  return {
    listTools: jest.fn().mockResolvedValue([
      { name: "estoque_saldo", description: "x", inputSchema: { type: "object", properties: {} } },
    ]),
    callTool: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

const ROUTER_ON_ROW = {
  usesCodeDefaults: true,
  routerEnabled: true,
  routerThreshold: 0.3,
  routerTopK: 3,
  routerReformCheckpoint: "PRODUCTION",
  routerReformNPairs: 5,
  contextWindowCheckpoint: "PRODUCTION",
  contextWindowSize: 20,
  contextWindowIncludeSystem: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue({ id: "user-1", platformRole: "operator", isActive: true });
  prisma.userDomainAccess.findMany.mockResolvedValue([{ domain: "estoque" }]);
  prisma.message.create.mockResolvedValue({});
  prisma.message.findMany.mockResolvedValue([]);
  prisma.conversation.findUnique.mockResolvedValue({ id: "conv-1", userId: "user-1" });
  prisma.agentSettings.findUnique.mockResolvedValue(ROUTER_ON_ROW);
  getActiveLlmConfig.mockResolvedValue({ provider: "anthropic", model: "claude-sonnet-4-7", apiKey: "k" });
  buildLlmClient.mockReturnValue(makeClient("Resposta final."));
  createMcpSession.mockResolvedValue(makeSession());
  resolveReformLlm.mockResolvedValue({ provider: "openai", apiKey: "sk", model: "gpt-5.4-nano", credentialId: "cred-1" });
});

describe("runAgent , roteamento contextual (3 camadas)", () => {
  test("Camada 1 sem fallback: NÃO reformula; decisão final = L1", async () => {
    pickDomains.mockResolvedValueOnce(domainDecision(["estoque"]));
    const res = await runAgent({ conversationId: "conv-1", userId: "user-1", userMessage: "Saldo de bicicleta?", channel: "in_app", isPlayground: false });
    expect(res.ok).toBe(true);
    expect(reformulateQuestion).not.toHaveBeenCalled();
    expect(pickDomains).toHaveBeenCalledTimes(1);
    expect(createDecision).toHaveBeenCalledWith(
      expect.objectContaining({ usedReformulation: false, originalFallback: false }),
    );
  });

  test("Camada 1 fallback + reformulação: re-embedda e grava usedReformulation=true", async () => {
    pickDomains
      .mockResolvedValueOnce(fallbackDecision()) // L1
      .mockResolvedValueOnce(domainDecision(["estoque"])); // L3
    reformulateQuestion.mockResolvedValue({ reformulated: "Qual produto mais vendeu no mes passado?", used: true });

    const res = await runAgent({ conversationId: "conv-1", userId: "user-1", userMessage: "e do mes passado?", channel: "in_app", isPlayground: false });
    expect(res.ok).toBe(true);
    expect(reformulateQuestion).toHaveBeenCalledTimes(1);
    expect(pickDomains).toHaveBeenCalledTimes(2);
    expect(createDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        usedReformulation: true,
        originalFallback: true,
        reformulatedQuestion: "Qual produto mais vendeu no mes passado?",
      }),
    );
  });

  test("reformulação retorna null: mantém decisão L1 (fallback)", async () => {
    pickDomains.mockResolvedValueOnce(fallbackDecision());
    reformulateQuestion.mockResolvedValue({ reformulated: null, used: false });
    const res = await runAgent({ conversationId: "conv-1", userId: "user-1", userMessage: "??", channel: "in_app", isPlayground: false });
    expect(res.ok).toBe(true);
    expect(pickDomains).toHaveBeenCalledTimes(1); // sem re-embedding
    expect(createDecision).toHaveBeenCalledWith(
      expect.objectContaining({ usedReformulation: false, originalFallback: true }),
    );
  });

  test("SEGURANÇA: reformulação leva a domínio proibido -> fast-path RBAC dispara na decisão FINAL", async () => {
    // operator só tem acesso a "estoque". L1 fallback; reformulada cai em "financeiro".
    pickDomains
      .mockResolvedValueOnce(fallbackDecision()) // L1
      .mockResolvedValueOnce(domainDecision(["financeiro"])); // L3, proibido
    reformulateQuestion.mockResolvedValue({ reformulated: "Qual o saldo bancario?", used: true });

    const res = await runAgent({ conversationId: "conv-1", userId: "user-1", userMessage: "e o banco?", channel: "in_app", isPlayground: false });
    expect(res.ok).toBe(true);
    expect(respondPermissionDenied).toHaveBeenCalledWith(
      expect.objectContaining({ deniedDomains: ["financeiro"] }),
    );
  });

  test("shadow (routerEnabled=false): NÃO gasta LLM de reformulação mesmo em fallback", async () => {
    prisma.agentSettings.findUnique.mockResolvedValue({ ...ROUTER_ON_ROW, routerEnabled: false });
    pickDomains.mockResolvedValueOnce(fallbackDecision());
    const res = await runAgent({ conversationId: "conv-1", userId: "user-1", userMessage: "e do mes passado?", channel: "in_app", isPlayground: false });
    expect(res.ok).toBe(true);
    expect(reformulateQuestion).not.toHaveBeenCalled();
  });
});
