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
const mockAcquireUserLock = jest.fn();
const mockReleaseUserLock = jest.fn();
const mockEmitAgentReply = jest.fn();
const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();

jest.mock("./user-lock", () => ({
  acquireUserLock: (...args: unknown[]) => mockAcquireUserLock(...args),
  releaseUserLock: (...args: unknown[]) => mockReleaseUserLock(...args),
}));
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
// emitAgentReply mockado (o fetch/HMAC real é testado em emit-reply.test.ts).
jest.mock("@/lib/whatsapp/emit-reply", () => ({ emitAgentReply: mockEmitAgentReply }));
// redis mockado para a idempotência de saída.
jest.mock("@/lib/redis", () => ({
  redis: {
    get: (...args: unknown[]) => mockRedisGet(...args),
    set: (...args: unknown[]) => mockRedisSet(...args),
  },
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
    messageId: "assistant-msg-1",
    toolsCalled: ["estoque_modelo"],
    reasoningMs: 1234,
  });
  mockBuildCloudClientFromDb.mockResolvedValue({ sendText: mockSendText });
  mockSendText.mockResolvedValue(undefined);
  mockAcquireUserLock.mockResolvedValue(true);
  mockReleaseUserLock.mockResolvedValue(undefined);
  mockEmitAgentReply.mockResolvedValue(undefined);
  // Sem replay por padrão (caminho normal); set best-effort resolve.
  mockRedisGet.mockResolvedValue(null);
  mockRedisSet.mockResolvedValue("OK");
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
  const outboundTargets = [{ url: "https://n8n.example.com/webhook/reply", secret: "my-secret" }];
  const webhookJob: AgentJobData = {
    ...BASE_JOB,
    businessId: "5932",
    channelConfig: {
      responseMode: "n8n_webhook",
      outboundTargets,
    },
  };

  it("emite envelope agent.reply kind:final com tools/reasoning/usage do runAgent", async () => {
    await processAgentJob(webhookJob);

    expect(mockEmitAgentReply).toHaveBeenCalledTimes(1);
    const [targets, envelope] = mockEmitAgentReply.mock.calls[0] as [unknown, { kind: string; data: Record<string, unknown> }];
    expect(targets).toEqual(outboundTargets);
    expect(envelope.kind).toBe("final");
    expect(envelope.data.reply).toContain("42 bicicletas");
    expect(envelope.data.tools).toEqual(["estoque_modelo"]);
    expect(envelope.data.reasoningMs).toBe(1234);
    expect(envelope.data.usage).toEqual({ tokensInput: 100, tokensOutput: 50, costUsd: 0.001 });
    expect(envelope.data.assistantMessageId).toBe("assistant-msg-1");
    expect(envelope.data.businessId).toBe("5932");
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it("grava a idempotência whatsapp:replied após runAgent", async () => {
    await processAgentJob(webhookJob);

    expect(mockRedisSet).toHaveBeenCalledWith(
      "whatsapp:replied:wamid.123",
      expect.any(String),
      "EX",
      24 * 60 * 60,
    );
  });

  it("replay (whatsapp:replied existe): reentrega sem rodar agente nem lock", async () => {
    const savedPayload = JSON.stringify({
      inboundMessageId: "wamid.123",
      to: BASE_JOB.replyTo,
      businessId: "5932",
      sessionId: "conv-001",
      assistantMessageId: "assistant-msg-1",
      ok: true,
      reason: null,
      reply: "resposta salva",
      suggestions: [],
      tools: [],
      reasoningMs: 0,
      usage: { tokensInput: 0, tokensOutput: 0, costUsd: 0 },
      messageType: "text",
    });
    mockRedisGet.mockResolvedValueOnce(savedPayload);

    await processAgentJob(webhookJob);

    expect(mockRunAgent).not.toHaveBeenCalled();
    expect(mockAcquireUserLock).not.toHaveBeenCalled();
    expect(mockEmitAgentReply).toHaveBeenCalledTimes(1);
    const [, envelope] = mockEmitAgentReply.mock.calls[0] as [unknown, { kind: string; data: Record<string, unknown> }];
    expect(envelope.kind).toBe("final");
    expect(envelope.data.reply).toBe("resposta salva");
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

  it("Meta mídia (PRODUCTION, sem text): baixa, transcreve e passa isAudio=true", async () => {
    await processAgentJob(audioJob);

    expect(mockDownloadMedia).toHaveBeenCalledWith("media-id-abc");
    expect(mockTranscribeAudio).toHaveBeenCalled();
    expect(mockRunAgent).toHaveBeenCalledWith(
      expect.objectContaining({ userMessage: "Qual o estoque de bicicletas?", isAudio: true }),
    );
  });

  it("n8n transcrito (canal de áudio OFF): usa data.text direto, sem baixar/transcrever", async () => {
    mockAgentSettingsFindFirst.mockResolvedValue({
      audioCheckpoint: "OFF",
      imageCheckpoint: "OFF",
    });
    const n8nAudioJob: AgentJobData = {
      ...BASE_JOB,
      type: "audio",
      text: "qual o estoque?",
    };

    await processAgentJob(n8nAudioJob);

    // NÃO cai no early-return de "não entendo áudio" e NÃO baixa/transcreve.
    expect(mockDownloadMedia).not.toHaveBeenCalled();
    expect(mockTranscribeAudio).not.toHaveBeenCalled();
    // runAgent recebe o texto do n8n com isAudio=true.
    expect(mockRunAgent).toHaveBeenCalledWith(
      expect.objectContaining({ userMessage: "qual o estoque?", isAudio: true }),
    );
  });

  it("Meta mídia com canal OFF e sem text: mantém o early-return de áudio desabilitado", async () => {
    mockAgentSettingsFindFirst.mockResolvedValue({
      audioCheckpoint: "OFF",
      imageCheckpoint: "OFF",
    });
    const metaAudioOffJob: AgentJobData = {
      ...BASE_JOB,
      type: "audio",
      text: undefined,
      audioMediaId: "media-id-abc",
    };

    await processAgentJob(metaAudioOffJob);

    expect(mockTranscribeAudio).not.toHaveBeenCalled();
    expect(mockRunAgent).not.toHaveBeenCalled();
    expect(mockSendText).toHaveBeenCalledWith(
      BASE_JOB.replyTo,
      expect.stringContaining("áudio"),
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
      expect.stringContaining("processar sua mensagem"),
    );
  });

  it("modo n8n_webhook: emite envelope blocked/technical_error", async () => {
    mockRunAgent.mockResolvedValue({ ok: false, error: "MCP indisponível" });
    const webhookJob: AgentJobData = {
      ...BASE_JOB,
      channelConfig: {
        responseMode: "n8n_webhook",
        outboundTargets: [{ url: "https://n8n/x", secret: "s1" }],
      },
    };

    await processAgentJob(webhookJob);

    const [, envelope] = mockEmitAgentReply.mock.calls[0] as [unknown, { kind: string; data: Record<string, unknown> }];
    expect(envelope.kind).toBe("blocked");
    expect(envelope.data.ok).toBe(false);
    expect(envelope.data.reason).toBe("technical_error");
  });
});

// ──────────────────────────────────────────────
// Testes , recusa L3 (permission_denied)
// ──────────────────────────────────────────────

describe("processAgentJob , recusa L3 permission_denied", () => {
  it("modo n8n_webhook: recusa sai como kind:blocked/permission_denied com deniedModule", async () => {
    mockRunAgent.mockResolvedValue({
      ok: true,
      message: "recusa",
      suggestions: [],
      usage: { tokensInput: 0, tokensOutput: 0, costUsd: 0 },
      messageId: "m-recusa",
      toolsCalled: [],
      reasoningMs: 0,
      deniedModule: "financeiro",
      allowedModules: ["estoque"],
    });
    const webhookJob: AgentJobData = {
      ...BASE_JOB,
      channelConfig: {
        responseMode: "n8n_webhook",
        outboundTargets: [{ url: "https://n8n/x", secret: "s1" }],
      },
    };

    await processAgentJob(webhookJob);

    const [, envelope] = mockEmitAgentReply.mock.calls[0] as [unknown, { kind: string; data: Record<string, unknown> }];
    expect(envelope.kind).toBe("blocked");
    expect(envelope.data.reason).toBe("permission_denied");
    expect(envelope.data.deniedModule).toBe("financeiro");
    expect(envelope.data.allowedModules).toEqual(["estoque"]);
  });
});

// ──────────────────────────────────────────────
// Testes , heartbeat suprimido (decisão #9)
// ──────────────────────────────────────────────

describe("processAgentJob , heartbeat suprimido no WhatsApp", () => {
  it("não emite mensagem intermediária: só a resposta final", async () => {
    const webhookJob: AgentJobData = {
      ...BASE_JOB,
      channelConfig: {
        responseMode: "n8n_webhook",
        outboundTargets: [{ url: "https://n8n/x", secret: "s1" }],
      },
    };

    await processAgentJob(webhookJob);

    expect(mockEmitAgentReply).toHaveBeenCalledTimes(1);
  });
});

// ──────────────────────────────────────────────
// Testes , lock por usuário
// ──────────────────────────────────────────────

describe("processAgentJob , lock por usuário", () => {
  it("lança erro controlado e NÃO processa quando o lock está ocupado", async () => {
    mockAcquireUserLock.mockResolvedValue(false);

    await expect(processAgentJob(BASE_JOB)).rejects.toThrow(/lock|ocupad/i);

    expect(mockGetOrCreateWhatsappConversation).not.toHaveBeenCalled();
    expect(mockRunAgent).not.toHaveBeenCalled();
  });

  it("adquire e libera o lock no caminho feliz", async () => {
    mockAcquireUserLock.mockResolvedValue(true);

    await processAgentJob(BASE_JOB);

    expect(mockAcquireUserLock).toHaveBeenCalledWith(BASE_JOB.userId);
    expect(mockRunAgent).toHaveBeenCalled();
    expect(mockReleaseUserLock).toHaveBeenCalledWith(BASE_JOB.userId);
  });

  it("libera o lock mesmo quando runAgent lança", async () => {
    mockAcquireUserLock.mockResolvedValue(true);
    mockRunAgent.mockRejectedValue(new Error("boom"));

    await expect(processAgentJob(BASE_JOB)).rejects.toThrow("boom");

    expect(mockReleaseUserLock).toHaveBeenCalledWith(BASE_JOB.userId);
  });
});
