/**
 * Testes do endpoint POST /api/integrations/whatsapp/inbound.
 *
 * Cobre: autenticação HMAC, validação de payload, idempotência,
 * resolução de usuário, teto diário e enfileiramento do job.
 */

// ──────────────────────────────────────────────
// Mocks , DEVEM vir antes de qualquer import
// ──────────────────────────────────────────────

const mockVerifySignature = jest.fn();
const mockResolveWhatsappUser = jest.fn();
const mockProcessedFindUnique = jest.fn();
const mockProcessedCreate = jest.fn();
const mockProcessedCount = jest.fn();
const mockConversationCount = jest.fn();
const mockWebhookFindFirst = jest.fn();
const mockWebhookFindMany = jest.fn();
const mockAgentSettingsFindFirst = jest.fn();
const mockChannelFindUnique = jest.fn();
const mockAppSettingFindUnique = jest.fn();
const mockLogAudit = jest.fn();
const mockQueueAdd = jest.fn();
const mockEmitAgentReply = jest.fn();
const mockDecrypt = jest.fn((s: string) => s.replace("enc:", ""));

jest.mock("@/lib/whatsapp/hmac", () => ({ verifySignature: mockVerifySignature }));
jest.mock("@/lib/whatsapp/resolve", () => ({ resolveWhatsappUser: mockResolveWhatsappUser }));
jest.mock("@/lib/whatsapp/emit-reply", () => ({ emitAgentReply: mockEmitAgentReply }));
jest.mock("@/lib/audit", () => ({ logAudit: mockLogAudit }));
jest.mock("@/lib/encryption", () => ({
  encrypt: jest.fn((s: string) => `enc:${s}`),
  decrypt: mockDecrypt,
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    processedWhatsappMessage: {
      findUnique: mockProcessedFindUnique,
      create: mockProcessedCreate,
      count: mockProcessedCount,
    },
    conversation: { count: mockConversationCount },
    whatsappWebhook: { findFirst: mockWebhookFindFirst, findMany: mockWebhookFindMany },
    agentSettings: { findFirst: mockAgentSettingsFindFirst },
    whatsappChannel: { findUnique: mockChannelFindUnique },
    appSetting: { findUnique: mockAppSettingFindUnique },
  },
}));

// Mock rate-limit para evitar conexão Redis nos testes
jest.mock("@/lib/rate-limit", () => ({
  checkLoginRateLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 99 }),
  clearLoginRateLimit: jest.fn().mockResolvedValue(undefined),
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 99 }),
}));

// Mock ioredis para evitar conexão real
jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    connect: jest.fn(),
    quit: jest.fn(),
  }));
});

// Mock bullmq Queue
jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: mockQueueAdd,
  })),
  Worker: jest.fn(),
}));

// ──────────────────────────────────────────────
// Import após mocks
// ──────────────────────────────────────────────

import { POST } from "./route";

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function makeRequest(
  body: Record<string, unknown>,
  overrideHeaders: Record<string, string> = {},
): Request {
  const bodyStr = JSON.stringify(body);
  return new Request("http://localhost/api/integrations/whatsapp/inbound", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature": "valid-sig",
      "X-Timestamp": String(Date.now()),
      ...overrideHeaders,
    },
    body: bodyStr,
  });
}

const VALID_PAYLOAD = {
  messageId: "wamid.abc123",
  from: "+5511999999999",
  timestamp: Date.now(),
  type: "text",
  text: "Olá!",
};

// ──────────────────────────────────────────────
// Setup
// ──────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  // Por padrão: HMAC válido
  mockVerifySignature.mockReturnValue(true);
  // Por padrão: webhook inbound habilitado (fail-closed exige um webhook configurado)
  mockWebhookFindFirst.mockResolvedValue({
    id: "wh-1",
    direction: "inbound",
    secret: "enc:mysecret",
    enabled: true,
  });
  // Por padrão: mensagem ainda não processada
  mockProcessedFindUnique.mockResolvedValue(null);
  // Por padrão: create bem-sucedido
  mockProcessedCreate.mockResolvedValue({ messageId: VALID_PAYLOAD.messageId });
  // Por padrão: usuário resolvido com sucesso (com platformRole para L2)
  mockResolveWhatsappUser.mockResolvedValue({
    status: "ok",
    user: { id: "user-001", name: "João", isActive: true, platformRole: "viewer" },
  });
  // Por padrão: canal WhatsApp liberado para todos (viewer)
  mockAgentSettingsFindFirst.mockResolvedValue({ whatsappAccessLevel: "viewer" });
  // Por padrão: um outbound habilitado (targetUrl + secret cifrado)
  mockWebhookFindMany.mockResolvedValue([
    { targetUrl: "https://n8n/x", url: null, secret: "enc:s1", direction: "outbound", enabled: true },
  ]);
  // Por padrão: sem teto configurado
  mockAppSettingFindUnique.mockResolvedValue(null);
  // Por padrão: 0 conversas hoje
  mockConversationCount.mockResolvedValue(0);
  mockProcessedCount.mockResolvedValue(0);
  // Por padrão: canal padrão
  mockChannelFindUnique.mockResolvedValue({ id: "global", responseMode: "direct", enabled: true });
  // Por padrão: job enfileirado com sucesso
  mockQueueAdd.mockResolvedValue({ id: "job-1" });
  // emitAgentReply retorna Promise (o código encadeia .catch)
  mockEmitAgentReply.mockResolvedValue(undefined);
});

// ──────────────────────────────────────────────
// Testes
// ──────────────────────────────────────────────

describe("POST /api/integrations/whatsapp/inbound", () => {
  it("retorna 401 quando HMAC é inválido", async () => {
    mockVerifySignature.mockReturnValue(false);
    // Precisa de webhook configurado para que a validação ocorra
    mockWebhookFindFirst.mockResolvedValueOnce({
      id: "wh-1",
      direction: "inbound",
      secret: "enc:mysecret",
      enabled: true,
    });

    const req = makeRequest(VALID_PAYLOAD);
    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(401);
  });

  it("retorna 400 quando payload é inválido (campo obrigatório ausente)", async () => {
    const req = makeRequest({ messageId: "x", from: "+5511" }); // sem type
    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
  });

  it("retorna 400 para JSON inválido", async () => {
    const req = new Request("http://localhost/api/integrations/whatsapp/inbound", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature": "x",
        "X-Timestamp": "1",
      },
      body: "não é json",
    });
    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
  });

  it("retorna 200 (no-op) para messageId já processado", async () => {
    mockProcessedFindUnique.mockResolvedValue({ messageId: VALID_PAYLOAD.messageId });

    const req = makeRequest(VALID_PAYLOAD);
    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    const body = await res.json() as { noOp?: boolean };
    expect(body.noOp).toBe(true);
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("L1: número desconhecido não enfileira, audita e dispara webhook blocked/user_not_found", async () => {
    mockResolveWhatsappUser.mockResolvedValue({ status: "unknown" });

    const req = makeRequest(VALID_PAYLOAD);
    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    const body = await res.json() as { rejected?: boolean; reason?: string };
    expect(body.rejected).toBe(true);
    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "whatsapp_inbound_rejected" }),
    );
    expect(mockEmitAgentReply).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        kind: "blocked",
        data: expect.objectContaining({ ok: false, reason: "user_not_found" }),
      }),
    );
  });

  it("D: loadOutboundTargets filtra por events has agent_reply (F5 D)", async () => {
    mockResolveWhatsappUser.mockResolvedValue({ status: "unknown" });

    const req = makeRequest(VALID_PAYLOAD);
    await POST(req as Parameters<typeof POST>[0]);

    expect(mockWebhookFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          direction: "outbound",
          enabled: true,
          events: { has: "agent_reply" },
        }),
      }),
    );
  });

  it("L1: usuário inativo não enfileira, audita e dispara webhook blocked/user_inactive", async () => {
    mockResolveWhatsappUser.mockResolvedValue({ status: "inactive" });

    const req = makeRequest(VALID_PAYLOAD);
    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "whatsapp_inbound_rejected" }),
    );
    expect(mockEmitAgentReply).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        kind: "blocked",
        data: expect.objectContaining({ ok: false, reason: "user_inactive" }),
      }),
    );
  });

  it("L2: canal off não enfileira e dispara channel_disabled", async () => {
    mockAgentSettingsFindFirst.mockResolvedValue({ whatsappAccessLevel: "off" });

    const req = makeRequest(VALID_PAYLOAD);
    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    const body = await res.json() as { rejected?: boolean; reason?: string };
    expect(body.rejected).toBe(true);
    expect(body.reason).toBe("channel_disabled");
    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(mockEmitAgentReply).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        kind: "blocked",
        data: expect.objectContaining({ reason: "channel_disabled" }),
      }),
    );
  });

  it("L2: role abaixo do nível não enfileira e dispara role_not_allowed", async () => {
    mockAgentSettingsFindFirst.mockResolvedValue({ whatsappAccessLevel: "admin" });
    mockResolveWhatsappUser.mockResolvedValue({
      status: "ok",
      user: { id: "user-001", name: "João", isActive: true, platformRole: "viewer" },
    });

    const req = makeRequest(VALID_PAYLOAD);
    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    const body = await res.json() as { rejected?: boolean; reason?: string };
    expect(body.reason).toBe("role_not_allowed");
    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(mockEmitAgentReply).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        kind: "blocked",
        data: expect.objectContaining({ reason: "role_not_allowed" }),
      }),
    );
  });

  it("L2: role satisfaz o nível enfileira normalmente, sem emitAgentReply", async () => {
    mockAgentSettingsFindFirst.mockResolvedValue({ whatsappAccessLevel: "manager" });
    mockResolveWhatsappUser.mockResolvedValue({
      status: "ok",
      user: { id: "user-001", name: "João", isActive: true, platformRole: "admin" },
    });

    const req = makeRequest(VALID_PAYLOAD);
    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(202);
    expect(mockQueueAdd).toHaveBeenCalled();
    expect(mockEmitAgentReply).not.toHaveBeenCalled();
  });

  it("retorna 503 quando não há webhook inbound configurado (fail-closed)", async () => {
    mockWebhookFindFirst.mockResolvedValue(null);

    const req = makeRequest(VALID_PAYLOAD);
    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(503);
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("retorna 200 quando teto diário é atingido (conta ProcessedWhatsappMessage por userId)", async () => {
    // A contagem agora usa processedWhatsappMessage.count({ where: { userId, processedAt } })
    mockProcessedCount.mockResolvedValue(100); // igual ao default limit

    const req = makeRequest(VALID_PAYLOAD);
    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    const body = await res.json() as { rejected?: boolean; reason?: string };
    expect(body.rejected).toBe(true);
    expect(body.reason).toBe("daily_limit_exceeded");
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("retorna 202 e enfileira job para mensagem válida de usuário conhecido", async () => {
    const req = makeRequest(VALID_PAYLOAD);
    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(202);
    const body = await res.json() as { queued?: boolean; jobId?: string };
    expect(body.queued).toBe(true);
    // processedCreate agora inclui userId
    expect(mockProcessedCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ messageId: VALID_PAYLOAD.messageId }) }),
    );
    expect(mockQueueAdd).toHaveBeenCalled();
    expect(mockEmitAgentReply).not.toHaveBeenCalled();
  });

  it("payload do job enfileirado contém userId e dados da mensagem", async () => {
    const req = makeRequest(VALID_PAYLOAD);
    await POST(req as Parameters<typeof POST>[0]);

    const [, jobData] = mockQueueAdd.mock.calls[0] as [string, AgentJobData];
    expect(jobData.userId).toBe("user-001");
    expect(jobData.messageId).toBe(VALID_PAYLOAD.messageId);
    expect(jobData.type).toBe("text");
    expect(jobData.text).toBe("Olá!");
    expect(jobData.replyTo).toBe(VALID_PAYLOAD.from);
  });
});

// Necessário apenas para tipagem no teste acima
import type { AgentJobData } from "@/worker/agent/processor";
