/**
 * T0.1 , Testes do caminho canônico de entrada por SLUG (`/api/webhooks/<slug>`).
 *
 * Cobertura PORTADA de `src/app/api/integrations/whatsapp/inbound/route.test.ts`
 * (a rota fixa legada, que passa a responder 410 Gone): autenticação por token
 * (Bearer), validação de payload, idempotência, resolução de usuário, barreiras
 * L1/L2, teto diário e enfileiramento do job.
 *
 * Diferenças de contrato em relação à rota legada (porte não é 1:1):
 *  - webhook inexistente para o slug → **404** (a legada devolvia 503);
 *  - caminho ausente → 404;
 *  - secret que não descifra → 500.
 */

// ──────────────────────────────────────────────
// Mocks , DEVEM vir antes de qualquer import
// ──────────────────────────────────────────────

const mockVerifyToken = jest.fn();
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
const mockDecrypt = jest.fn((s: string) => {
  if (!s.startsWith("enc:")) throw new Error("não descifra");
  return s.slice(4);
});

jest.mock("@/lib/whatsapp/hmac", () => ({ verifyToken: mockVerifyToken }));
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

import { NextRequest } from "next/server";
import { handleSlugInbound } from "./slug-inbound";

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

const SLUG = "matrixgroup";

/** A linha inbound resolvida pelo slug (o mock ignora o `select` do Prisma). */
const WEBHOOK_INBOUND = {
  id: "wh-1",
  direction: "inbound",
  enabled: true,
  isWhatsappReceiver: true,
  path: SLUG,
  secret: "enc:mysecret",
  businessId: "5561995630029",
  connectionId: "conn-1",
  name: "Matrix Group",
  // Conexão com o Envio configurado: os bloqueios saem pelo webhook dela.
  // (Em modo `direct` o bloqueio sai pelo cloud-client, SPEC §3.5.)
  responseMode: "n8n_webhook",
};

function makeRequest(
  body: Record<string, unknown> | string,
  overrideHeaders: Record<string, string> = {},
): NextRequest {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  return new NextRequest(`http://localhost/api/webhooks/${SLUG}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid-token",
      ...overrideHeaders,
    },
    body: bodyStr,
  });
}

function makeParams(slug: string[]): Promise<{ slug: string[] }> {
  return Promise.resolve({ slug });
}

function callInbound(
  body: Record<string, unknown> | string,
  slug: string[] = [SLUG],
): ReturnType<typeof handleSlugInbound> {
  return handleSlugInbound(makeRequest(body), makeParams(slug));
}

const VALID_PAYLOAD = {
  wa_id: "+5511999999999",
  user_id: "BR.4377207372590200",
  message_id: "wamid.abc123",
  timestamp: Date.now(),
  type: "text",
  text: "Olá!",
};

// ──────────────────────────────────────────────
// Setup
// ──────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  // Por padrão: token válido
  mockVerifyToken.mockReturnValue(true);
  // Por padrão: o slug resolve para o webhook receptor habilitado
  mockWebhookFindFirst.mockResolvedValue(WEBHOOK_INBOUND);
  // Por padrão: mensagem ainda não processada
  mockProcessedFindUnique.mockResolvedValue(null);
  // Por padrão: create bem-sucedido
  mockProcessedCreate.mockResolvedValue({ messageId: VALID_PAYLOAD.message_id });
  // Por padrão: usuário resolvido com sucesso (com platformRole para L2)
  mockResolveWhatsappUser.mockResolvedValue({
    status: "ok",
    user: { id: "user-001", name: "João", isActive: true, platformRole: "viewer" },
  });
  // Por padrão: canal WhatsApp liberado para todos (viewer)
  mockAgentSettingsFindFirst.mockResolvedValue({ whatsappAccessLevel: "viewer" });
  // Por padrão: um outbound habilitado (targetUrl + secret cifrado)
  mockWebhookFindMany.mockResolvedValue([
    {
      targetUrl: "https://destino.example.com/hook",
      url: null,
      secret: "enc:s1",
      direction: "outbound",
      enabled: true,
      connectionId: WEBHOOK_INBOUND.connectionId,
    },
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

describe("handleSlugInbound , resolução do webhook pelo slug", () => {
  it("retorna 404 quando não há webhook para o slug (fail-closed; a legada devolvia 503)", async () => {
    mockWebhookFindFirst.mockResolvedValue(null);

    const res = await callInbound(VALID_PAYLOAD);
    expect(res.status).toBe(404);
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("retorna 404 quando o caminho está ausente", async () => {
    const res = await callInbound(VALID_PAYLOAD, []);
    expect(res.status).toBe(404);
    expect(mockWebhookFindFirst).not.toHaveBeenCalled();
  });

  it("retorna 500 quando o secret do webhook não descifra", async () => {
    mockWebhookFindFirst.mockResolvedValue({ ...WEBHOOK_INBOUND, secret: "corrompido" });

    const res = await callInbound(VALID_PAYLOAD);
    expect(res.status).toBe(500);
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("consulta o webhook por direction inbound + isWhatsappReceiver + path", async () => {
    await callInbound(VALID_PAYLOAD);

    expect(mockWebhookFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          direction: "inbound",
          enabled: true,
          isWhatsappReceiver: true,
          path: SLUG,
        }),
      }),
    );
  });
});

describe("handleSlugInbound , autenticação e payload", () => {
  it("retorna 401 quando o token é inválido", async () => {
    mockVerifyToken.mockReturnValue(false);

    const res = await callInbound(VALID_PAYLOAD);
    expect(res.status).toBe(401);
  });

  it("retorna 400 quando payload é inválido (campo obrigatório ausente)", async () => {
    const res = await callInbound({ messageId: "x", from: "+5511" }); // sem type
    expect(res.status).toBe(400);
  });

  it("retorna 400 para JSON inválido", async () => {
    const res = await callInbound("não é json");
    expect(res.status).toBe(400);
  });
});

describe("handleSlugInbound , idempotência", () => {
  it("retorna 200 (no-op) para messageId já processado", async () => {
    mockProcessedFindUnique.mockResolvedValue({ messageId: VALID_PAYLOAD.message_id });

    const res = await callInbound(VALID_PAYLOAD);
    expect(res.status).toBe(200);
    const body = await res.json() as { noOp?: boolean };
    expect(body.noOp).toBe(true);
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });
});

describe("handleSlugInbound , barreiras L1/L2", () => {
  it("L1: número desconhecido não enfileira, audita e dispara webhook blocked/user_not_found", async () => {
    mockResolveWhatsappUser.mockResolvedValue({ status: "unknown" });

    const res = await callInbound(VALID_PAYLOAD);
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

    await callInbound(VALID_PAYLOAD);

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

    const res = await callInbound(VALID_PAYLOAD);
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

    const res = await callInbound(VALID_PAYLOAD);
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

    const res = await callInbound(VALID_PAYLOAD);
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

    const res = await callInbound(VALID_PAYLOAD);
    expect(res.status).toBe(202);
    expect(mockQueueAdd).toHaveBeenCalled();
    expect(mockEmitAgentReply).not.toHaveBeenCalled();
  });
});

describe("handleSlugInbound , teto diário", () => {
  it("retorna 200 quando teto diário é atingido (conta ProcessedWhatsappMessage por userId)", async () => {
    mockProcessedCount.mockResolvedValue(100); // igual ao default limit

    const res = await callInbound(VALID_PAYLOAD);
    expect(res.status).toBe(200);
    const body = await res.json() as { rejected?: boolean; reason?: string };
    expect(body.rejected).toBe(true);
    expect(body.reason).toBe("daily_limit_exceeded");
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });
});

describe("handleSlugInbound , enfileiramento", () => {
  it("retorna 202 e enfileira job para mensagem válida de usuário conhecido", async () => {
    const res = await callInbound(VALID_PAYLOAD);
    expect(res.status).toBe(202);
    const body = await res.json() as { queued?: boolean; jobId?: string };
    expect(body.queued).toBe(true);
    expect(mockProcessedCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ messageId: VALID_PAYLOAD.message_id }) }),
    );
    expect(mockQueueAdd).toHaveBeenCalled();
    expect(mockEmitAgentReply).not.toHaveBeenCalled();
  });

  it("TB.2: o responseMode da conexão vence o singleton global", async () => {
    // Conexão em n8n_webhook, singleton em direct: o job precisa sair com o
    // modo da conexão e os targets dela (SPEC §3.4, resolve A13).
    mockWebhookFindFirst.mockResolvedValue({ ...WEBHOOK_INBOUND, responseMode: "n8n_webhook" });
    mockChannelFindUnique.mockResolvedValue({ id: "global", responseMode: "direct", enabled: true });

    await callInbound(VALID_PAYLOAD);

    const [, jobData] = mockQueueAdd.mock.calls[0] as [string, AgentJobData];
    expect(jobData.channelConfig?.responseMode).toBe("n8n_webhook");
  });

  it("TB.2: conexão sem modo (NULL do backfill) cai no singleton global", async () => {
    mockWebhookFindFirst.mockResolvedValue({ ...WEBHOOK_INBOUND, responseMode: null });
    mockChannelFindUnique.mockResolvedValue({ id: "global", responseMode: "n8n_webhook", enabled: true });

    await callInbound(VALID_PAYLOAD);

    const [, jobData] = mockQueueAdd.mock.calls[0] as [string, AgentJobData];
    expect(jobData.channelConfig?.responseMode).toBe("n8n_webhook");
  });

  it("payload do job enfileirado contém userId e dados da mensagem", async () => {
    await callInbound(VALID_PAYLOAD);

    const [, jobData] = mockQueueAdd.mock.calls[0] as [string, AgentJobData];
    expect(jobData.userId).toBe("user-001");
    expect(jobData.messageId).toBe(VALID_PAYLOAD.message_id);
    expect(jobData.type).toBe("text");
    expect(jobData.text).toBe("Olá!");
    expect(jobData.replyTo).toBe(VALID_PAYLOAD.wa_id);
    expect(jobData.businessId).toBe(WEBHOOK_INBOUND.businessId);
  });
});

// Necessário apenas para tipagem no teste acima
import type { AgentJobData } from "@/worker/agent/processor";
