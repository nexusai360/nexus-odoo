/**
 * Matriz de checkpoint da Onda 2 da modernizacao dos adapters de LLM.
 *
 * Verifica que o `runAgent` envia (ou nao) `reasoningEffort` para o adapter
 * em todas as combinacoes de:
 *   source       (bubble | playground | whatsapp)
 *   checkpoint   (OFF | PLAYGROUND | PRODUCTION)
 *   cap especial (modelo nao suporta com tools | modelo levels=["auto"])
 *
 * Estrategia de mock: substituir `getActiveLlmConfig` para devolver um modelo
 * controlado, e `buildLlmClient` para retornar um stub cujo `.chat` registra
 * o `reasoningEffort` recebido. O catalog real (REASONING_CAPS) decide a
 * politica.
 */

import { runAgent } from "./run-agent";

// Cliente LLM stub: captura argumentos
const chatCalls: Array<{ reasoningEffort?: string }> = [];
const makeStubClient = (model: string) => ({
  provider: "openai" as const,
  model,
  chat: jest.fn().mockImplementation(async (req: { reasoningEffort?: string }) => {
    chatCalls.push({ reasoningEffort: req.reasoningEffort });
    return {
      message: "Resposta final.",
      usage: { tokensInput: 100, tokensOutput: 20, costUsd: 0.01 },
      streamed: false,
    };
  }),
});

// Mocks de modulos externos do run-agent
jest.mock("@/lib/prisma", () => ({
  prisma: {
    agentSettings: { findUnique: jest.fn() },
    user: { findUnique: jest.fn().mockResolvedValue({ platformRole: "admin" }) },
  },
}));

jest.mock("./llm/get-client", () => ({
  buildLlmClient: jest.fn(),
}));
jest.mock("./llm/get-active-config", () => ({
  getActiveLlmConfig: jest.fn(),
}));
jest.mock("./llm/usage-logger", () => ({
  logUsage: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("./conversation", () => ({
  loadHistory: jest.fn().mockResolvedValue([]),
  persistMessage: jest.fn().mockResolvedValue(undefined),
  assertConversationOwned: jest.fn().mockResolvedValue(undefined),
  sanitizeHistoryPairs: jest.fn((h: unknown[]) => h),
  loadConversationReasoningHistory: jest.fn().mockResolvedValue([]),
  saveConversationReasoningHistory: jest.fn().mockResolvedValue(undefined),
  capReasoningHistory: jest.fn((h: unknown[]) => h),
  persistAssistantMessageWithTools: jest.fn().mockResolvedValue("msg-mock-id"),
  updateMessageToolResults: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("./prompt/compose", () => ({
  composeSystemPrompt: jest.fn(() => "system."),
}));
jest.mock("./bi-schema-reference", () => ({ BI_SCHEMA_REFERENCE: "" }));
jest.mock("./rag/search", () => ({ searchKb: jest.fn().mockResolvedValue([]) }));
jest.mock("./rag/embed", () => ({
  EmbeddingUnavailable: class extends Error {},
}));
jest.mock("./external-mcp", () => ({
  openExternalMcpSessions: jest.fn().mockResolvedValue(null),
  callExternalTool: jest.fn(),
  isExternalToolName: jest.fn(() => false),
}));
jest.mock("./mcp-client", () => ({
  createMcpSession: jest.fn().mockResolvedValue({
    listTools: jest.fn().mockResolvedValue([]),
    callTool: jest.fn(),
    close: jest.fn(),
  }),
  mcpToolsToProviderTools: jest.fn(() => []),
}));

const { prisma } = jest.requireMock("@/lib/prisma");
const { buildLlmClient } = jest.requireMock("./llm/get-client");
const { getActiveLlmConfig } = jest.requireMock("./llm/get-active-config");

function setup(opts: {
  model: string;
  checkpoint: "OFF" | "PLAYGROUND" | "PRODUCTION";
  effort: string | null;
}) {
  chatCalls.length = 0;
  prisma.agentSettings.findUnique.mockResolvedValue({
    identityBase: null,
    personality: "",
    tone: "",
    guardrails: [],
    advancedOverride: null,
    kbCheckpoint: "OFF",
    terminology: {},
    suggestionsEnabled: false,
    reasoningEffort: opts.effort,
    reasoningCheckpoint: opts.checkpoint,
    maxSuggestions: 3,
  });
  getActiveLlmConfig.mockResolvedValue({
    provider: "openai",
    model: opts.model,
    apiKey: "test",
    credentialId: null,
  });
  buildLlmClient.mockReturnValue(makeStubClient(opts.model));
}

async function run(
  source: "bubble" | "playground" | "whatsapp",
): Promise<{ reasoningEffort?: string }> {
  await runAgent({
    conversationId: "conv-1",
    userId: "user-1",
    userMessage: "qual o saldo?",
    isPlayground: source === "playground",
    source,
    channel: "in_app",
  });
  return chatCalls[0] ?? {};
}

describe("Onda 2 - matriz de checkpoint x source x cap", () => {
  describe("modelo padrao: gpt-5.4-nano (cap.supportsWithTools=true, levels=4)", () => {
    test("OFF + bubble: nao envia reasoning", async () => {
      setup({ model: "gpt-5.4-nano", checkpoint: "OFF", effort: "medium" });
      const call = await run("bubble");
      expect(call.reasoningEffort).toBeUndefined();
    });

    test("OFF + playground: nao envia", async () => {
      setup({ model: "gpt-5.4-nano", checkpoint: "OFF", effort: "medium" });
      const call = await run("playground");
      expect(call.reasoningEffort).toBeUndefined();
    });

    test("OFF + whatsapp: nao envia", async () => {
      setup({ model: "gpt-5.4-nano", checkpoint: "OFF", effort: "medium" });
      const call = await run("whatsapp");
      expect(call.reasoningEffort).toBeUndefined();
    });

    test("PLAYGROUND + bubble: nao envia (bubble nao e playground)", async () => {
      setup({ model: "gpt-5.4-nano", checkpoint: "PLAYGROUND", effort: "medium" });
      const call = await run("bubble");
      expect(call.reasoningEffort).toBeUndefined();
    });

    test("PLAYGROUND + playground: envia", async () => {
      setup({ model: "gpt-5.4-nano", checkpoint: "PLAYGROUND", effort: "medium" });
      const call = await run("playground");
      expect(call.reasoningEffort).toBe("medium");
    });

    test("PLAYGROUND + whatsapp: nao envia", async () => {
      setup({ model: "gpt-5.4-nano", checkpoint: "PLAYGROUND", effort: "medium" });
      const call = await run("whatsapp");
      expect(call.reasoningEffort).toBeUndefined();
    });

    test("PRODUCTION + bubble: envia", async () => {
      setup({ model: "gpt-5.4-nano", checkpoint: "PRODUCTION", effort: "high" });
      const call = await run("bubble");
      expect(call.reasoningEffort).toBe("high");
    });

    test("PRODUCTION + playground: envia", async () => {
      setup({ model: "gpt-5.4-nano", checkpoint: "PRODUCTION", effort: "low" });
      const call = await run("playground");
      expect(call.reasoningEffort).toBe("low");
    });

    test("PRODUCTION + whatsapp: envia", async () => {
      setup({ model: "gpt-5.4-nano", checkpoint: "PRODUCTION", effort: "medium" });
      const call = await run("whatsapp");
      expect(call.reasoningEffort).toBe("medium");
    });
  });

  describe("caps especiais", () => {
    test("modelo sem cap (gpt-3.5-turbo): nunca envia, mesmo PRODUCTION + bubble", async () => {
      setup({ model: "gpt-3.5-turbo", checkpoint: "PRODUCTION", effort: "high" });
      const call = await run("bubble");
      expect(call.reasoningEffort).toBeUndefined();
    });

    test("Haiku 4.5 (supportsWithTools=false): nao envia mesmo PRODUCTION", async () => {
      setup({ model: "claude-haiku-4-5", checkpoint: "PRODUCTION", effort: "high" });
      const call = await run("bubble");
      expect(call.reasoningEffort).toBeUndefined();
    });

    test("Gemini 3.1 Pro (levels=['auto']): envia 'auto' mesmo se banco tem 'medium'", async () => {
      setup({ model: "gemini-3.1-pro", checkpoint: "PRODUCTION", effort: "medium" });
      const call = await run("bubble");
      expect(call.reasoningEffort).toBe("auto");
    });
  });
});
