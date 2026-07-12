/**
 * Data de inicio das analises (AppSetting sync.corte_dados) no agente Nex.
 *
 * Prova o furo que existia: o runAgent tinha `prisma` em maos mas nunca chamava
 * getCorteDados, entao (a) o cache de processo ficava no valor PADRAO (mudar a data na tela
 * nao mudava nada no agente) e (b) o unico contexto temporal enviado ao LLM era a data de
 * hoje , o agente nao sabia que existe um piso de analise, e o DDL do Caminho 3c nao pedia
 * piso nenhum no SQL.
 *
 * Contrato coberto aqui:
 *  - o corte configurado e lido do banco a cada run (recomputado, nao constante de modulo);
 *  - o aviso entra no item VOLATIL de [Contexto], junto da data atual, e NUNCA no system
 *    prompt (o prefixo estavel e a base do prompt cache);
 *  - o DDL entregue ao admin (bi_consulta_avancada) traz a REGRA de piso com a data vigente.
 */

import { runAgent } from "./run-agent";
import { invalidarCacheCorte } from "@/lib/corte-dados";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    message: { create: jest.fn(), findMany: jest.fn() },
    conversation: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    agentSettings: { findUnique: jest.fn() },
    userDomainAccess: { findMany: jest.fn() },
    appSetting: { findUnique: jest.fn() },
  },
}));
jest.mock("./mcp-client", () => ({
  createMcpSession: jest.fn(),
  mcpToolsToProviderTools: jest.fn(() => []),
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
// composeSystemPrompt e' espionado para capturar o 4o argumento (biSchema).
// bi-schema-reference NAO e mockado de proposito: queremos o DDL real, com a regra.
jest.mock("./prompt/compose", () => ({
  composeSystemPrompt: jest.fn(() => "SYSTEM PROMPT ESTAVEL (sem data, sem corte)."),
}));
jest.mock("./rag/search", () => ({ searchKb: jest.fn().mockResolvedValue([]) }));
jest.mock("./rag/embed", () => ({
  EmbeddingUnavailable: class EmbeddingUnavailable extends Error {},
}));

const { prisma } = jest.requireMock("@/lib/prisma");
const { createMcpSession } = jest.requireMock("./mcp-client");
const { getActiveLlmConfig } = jest.requireMock("./llm/get-active-config");
const { buildLlmClient } = jest.requireMock("./llm/get-client");
const { composeSystemPrompt } = jest.requireMock("./prompt/compose");

type ChatArgs = { messages: Array<{ role: string; content: string }> };
let chatCalls: ChatArgs[] = [];

function makeClient() {
  return {
    provider: "anthropic" as const,
    model: "claude-sonnet-4-7",
    chat: jest.fn().mockImplementation(async (a: ChatArgs) => {
      chatCalls.push(a);
      return { message: "Resposta final.", toolCalls: [], usage: { tokensInput: 10, tokensOutput: 5 } };
    }),
  };
}

function makeSession() {
  return {
    listTools: jest.fn().mockResolvedValue([]),
    callTool: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

/** Ultima conversa enviada ao LLM. */
function ultimaConversa() {
  return chatCalls[chatCalls.length - 1].messages;
}

/** O item volatil de contexto (o penultimo: vem imediatamente antes da pergunta). */
function itemContexto() {
  const msgs = ultimaConversa();
  return msgs[msgs.length - 2].content;
}

function systemPrompt() {
  return ultimaConversa().find((m) => m.role === "system")!.content;
}

async function rodar(userId = "user-1") {
  return runAgent({
    conversationId: "conv-1",
    userId,
    userMessage: "Quanto faturamos em 2025?",
    channel: "in_app",
    isPlayground: false,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  chatCalls = [];
  invalidarCacheCorte(); // o cache do corte e de PROCESSO (TTL 60s): zera entre os testes
  prisma.user.findUnique.mockResolvedValue({ id: "user-1", platformRole: "operator", isActive: true });
  prisma.userDomainAccess.findMany.mockResolvedValue([{ domain: "fiscal" }]);
  prisma.message.create.mockResolvedValue({});
  prisma.message.findMany.mockResolvedValue([]);
  prisma.conversation.findUnique.mockResolvedValue({ id: "conv-1", userId: "user-1" });
  prisma.agentSettings.findUnique.mockResolvedValue(null);
  prisma.appSetting.findUnique.mockResolvedValue({ key: "sync.corte_dados", value: "2026-05-10" });
  getActiveLlmConfig.mockResolvedValue({ provider: "anthropic", model: "claude-sonnet-4-7", apiKey: "k" });
  buildLlmClient.mockReturnValue(makeClient());
  createMcpSession.mockResolvedValue(makeSession());
});

describe("runAgent , data de inicio das analises", () => {
  test("le o corte configurado no banco (AppSetting sync.corte_dados)", async () => {
    const res = await rodar();
    expect(res.ok).toBe(true);
    expect(prisma.appSetting.findUnique).toHaveBeenCalledWith({
      where: { key: "sync.corte_dados" },
    });
  });

  test("o aviso do corte entra no item volatil de [Contexto], junto da data atual", async () => {
    await rodar();
    const ctx = itemContexto();
    expect(ctx).toContain("[Contexto] Data atual");
    expect(ctx).toContain("[Inicio das analises]");
    expect(ctx).toContain("10/05/2026"); // a data CONFIGURADA, nao a padrao (16/03/2026)
    expect(ctx).not.toContain("16/03/2026");
  });

  test("cache-safe: o corte NAO entra no system prompt (prefixo estavel)", async () => {
    await rodar();
    expect(systemPrompt()).not.toContain("[Inicio das analises]");
    expect(systemPrompt()).not.toContain("10/05/2026");
  });

  test("mudou a data na tela, o proximo run ja usa a nova (recomputado, nao congelado)", async () => {
    await rodar();
    expect(itemContexto()).toContain("10/05/2026");

    prisma.appSetting.findUnique.mockResolvedValue({ key: "sync.corte_dados", value: "2026-06-01" });
    invalidarCacheCorte(); // e o que a tela faz ao salvar a configuracao
    await rodar();
    expect(itemContexto()).toContain("01/06/2026");
  });

  test("admin: o DDL do Caminho 3c chega com a REGRA de piso e a data vigente", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u-adm", platformRole: "admin", isActive: true });
    await rodar("u-adm");

    const biSchema = composeSystemPrompt.mock.calls[0][3] as string;
    expect(biSchema).toContain("REGRA OBRIGATORIA");
    expect(biSchema).toContain("2026-05-10"); // piso interpolado com a data configurada
    expect(biSchema).toContain("mes >= '2026-05'"); // piso da serie mensal
    expect(biSchema).toContain("fato_nota_fiscal"); // o DDL continua ali, depois da regra
  });

  test("operator nao recebe o DDL do BI (o gate de role continua valendo)", async () => {
    await rodar();
    expect(composeSystemPrompt.mock.calls[0][3]).toBeUndefined();
  });
});
