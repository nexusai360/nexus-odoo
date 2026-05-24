/**
 * Testes do processor do job BullMQ `agent`.
 *
 * Todos os módulos externos são mockados para isolar a lógica do processor.
 */

// ──────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────

const mockRunAgent = jest.fn();
const mockGetOrCreateWhatsappConversation = jest.fn();
const mockTranscribeAudio = jest.fn();
const mockDownloadMedia = jest.fn();
const mockBuildCloudClientFromDb = jest.fn();
const mockSendText = jest.fn();
const mockFetch = jest.fn();
const mockAgentSettingsFindFirst = jest.fn();

jest.mock("@/lib/agent/run-agent", () => ({ runAgent: mockRunAgent }));
jest.mock("@/lib/agent/conversation", () => ({
  getOrCreateWhatsappConversation: mockGetOrCreateWhatsappConversation,
}));
jest.mock("@/lib/agent/transcribe", () => ({ transcribeAudio: mockTranscribeAudio }));
jest.mock("@/lib/whatsapp/cloud-client", () => ({
  buildCloudClientFromDb: mockBuildCloudClientFromDb,
}));
jest.mock("@/lib/whatsapp/hmac", () => ({
  signPayload: jest.fn().mockReturnValue("sig123"),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    agentSettings: { findFirst: (...args: unknown[]) => mockAgentSettingsFindFirst(...args) },
  },
}));

global.fetch = mockFetch;

// ──────────────────────────────────────────────
// Import após mocks
// ──────────────────────────────────────────────

import { processAgentJob, type AgentJobData } from "./processor";

// ──────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────

const BASE_JOB: AgentJobData = {
  messageId: "wamid.123",
  userId: "user-uuid-001",
  channel: "whatsapp",
  type: "text",
  text: "Qual o estoque de bicicletas?",
  replyTo: "+5511999999999",
  channelConfig: {
    responseMode: "direct",
  },
};

const CONVERSATION = { id: "conv-001", userId: "user-uuid-001", channel: "whatsapp", updatedAt: new Date() };

// ──────────────────────────────────────────────
// Setup/teardown
// ──────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockGetOrCreateWhatsappConversation.mockResolvedValue(CONVERSATION);
  mockRunAgent.mockResolvedValue({
    ok: true,
    message: "Há 42 bicicletas em estoque.",
    suggestions: [],
    usage: { tokensInput: 100, tokensOutput: 50, costUsd: 0.001 },
  });
  mockBuildCloudClientFromDb.mockResolvedValue({ sendText: mockSendText });
  mockSendText.mockResolvedValue(undefined);
  // Default , todos os recursos ativos em produção (não bloqueia audio/image).
  mockAgentSettingsFindFirst.mockResolvedValue({
    audioCheckpoint: "PRODUCTION",
    imageCheckpoint: "PRODUCTION",
  });
});

// ──────────────────────────────────────────────
// Testes , type=text, modo direct
// ──────────────────────────────────────────────

describe("processAgentJob , type=text, modo direct", () => {
  it("chama runAgent com a mensagem de texto", async () => {
    await processAgentJob(BASE_JOB);

    expect(mockGetOrCreateWhatsappConversation).toHaveBeenCalledWith(BASE_JOB.userId);
    expect(mockRunAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: CONVERSATION.id,
        userId: BASE_JOB.userId,
        userMessage: BASE_JOB.text,
        channel: "whatsapp",
      }),
    );
  });

  it("modo direct: chama cloud-client.sendText com a resposta", async () => {
    await processAgentJob(BASE_JOB);

    expect(mockBuildCloudClientFromDb).toHaveBeenCalled();
    expect(mockSendText).toHaveBeenCalledWith(
      BASE_JOB.replyTo,
      "Há 42 bicicletas em estoque.",
    );
  });
});

// ──────────────────────────────────────────────
// Testes , type=text, modo n8n_webhook
// ──────────────────────────────────────────────

describe("processAgentJob , type=text, modo n8n_webhook", () => {
  const webhookJob: AgentJobData = {
    ...BASE_JOB,
    channelConfig: {
      responseMode: "n8n_webhook",
      outboundUrl: "https://n8n.example.com/webhook/reply",
      outboundSecret: "my-secret",
    },
  };

  it("modo n8n_webhook: faz POST no outboundUrl com a resposta assinada", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await processAgentJob(webhookJob);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://n8n.example.com/webhook/reply",
      expect.objectContaining({ method: "POST" }),
    );
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it("modo n8n_webhook: inclui cabeçalhos de assinatura HMAC", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await processAgentJob(webhookJob);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Signature"]).toBeDefined();
    expect(headers["X-Timestamp"]).toBeDefined();
  });
});

// ──────────────────────────────────────────────
// Testes , type=audio
// ──────────────────────────────────────────────

describe("processAgentJob , type=audio", () => {
  const audioBuffer = new ArrayBuffer(512);
  const audioJob: AgentJobData = {
    ...BASE_JOB,
    type: "audio",
    text: undefined,
    audioMediaId: "media-id-abc",
  };

  beforeEach(() => {
    mockDownloadMedia.mockResolvedValue({ buffer: audioBuffer, mimeType: "audio/ogg" });
    mockBuildCloudClientFromDb.mockResolvedValue({
      sendText: mockSendText,
      downloadMedia: mockDownloadMedia,
    });
    mockTranscribeAudio.mockResolvedValue({
      text: "Qual o estoque de bicicletas?",
      durationSeconds: 2.1,
      inputTokens: 50,
      outputTokens: 0,
      modelUsed: "whisper-1",
    });
  });

  it("baixa a mídia e transcreve antes de chamar runAgent", async () => {
    await processAgentJob(audioJob);

    expect(mockDownloadMedia).toHaveBeenCalledWith("media-id-abc");
    expect(mockTranscribeAudio).toHaveBeenCalled();
    expect(mockRunAgent).toHaveBeenCalledWith(
      expect.objectContaining({ userMessage: "Qual o estoque de bicicletas?" }),
    );
  });
});

// ──────────────────────────────────────────────
// Testes , runAgent retorna erro
// ──────────────────────────────────────────────

describe("processAgentJob , erro do runAgent", () => {
  it("modo direct: envia mensagem de erro amigável ao usuário", async () => {
    mockRunAgent.mockResolvedValue({ ok: false, error: "MCP indisponível" });

    await processAgentJob(BASE_JOB);

    expect(mockSendText).toHaveBeenCalledWith(
      BASE_JOB.replyTo,
      expect.stringContaining("não consegui"),
    );
  });
});
