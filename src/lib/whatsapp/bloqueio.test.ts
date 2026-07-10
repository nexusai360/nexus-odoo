/**
 * TC.1/TC.2 , Entrega das mensagens de bloqueio (SPEC §3.5).
 *
 * `fireBlocked` hoje emite SEMPRE por webhook, mesmo quando o modo efetivo da
 * conexão é `direct` , nesse caso não há destino e o aviso é descartado em
 * silêncio. Passa a respeitar o modo: `n8n_webhook` → webhook da conexão;
 * `direct` → envio pelo cloud-client; nenhum caminho → log de aviso.
 *
 * E `daily_limit_exceeded` (A14) passa a ser um `reason` emitido: quem estoura
 * o teto diário hoje recebe silêncio absoluto.
 */

// ── Mocks (antes de qualquer import) ─────────────────────────────────────────
const mockVerifyToken = jest.fn();
const mockResolveWhatsappUser = jest.fn();
const mockProcessedFindUnique = jest.fn();
const mockProcessedCreate = jest.fn();
const mockProcessedCount = jest.fn();
const mockWebhookFindMany = jest.fn();
const mockAgentSettingsFindFirst = jest.fn();
const mockChannelFindUnique = jest.fn();
const mockAppSettingFindUnique = jest.fn();
const mockLogAudit = jest.fn();
const mockQueueAdd = jest.fn();
const mockEmitAgentReply = jest.fn();
const mockSendText = jest.fn();
const mockBuildCloudClientFromDb = jest.fn();

jest.mock("@/lib/whatsapp/hmac", () => ({ verifyToken: mockVerifyToken }));
jest.mock("@/lib/whatsapp/resolve", () => ({ resolveWhatsappUser: mockResolveWhatsappUser }));
jest.mock("@/lib/whatsapp/emit-reply", () => ({ emitAgentReply: mockEmitAgentReply }));
jest.mock("@/lib/whatsapp/cloud-client", () => ({
  buildCloudClientFromDb: mockBuildCloudClientFromDb,
}));
jest.mock("@/lib/audit", () => ({ logAudit: mockLogAudit }));
jest.mock("@/lib/encryption", () => ({
  encrypt: jest.fn((s: string) => `enc:${s}`),
  decrypt: jest.fn((s: string) => s.replace("enc:", "")),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    processedWhatsappMessage: {
      findUnique: mockProcessedFindUnique,
      create: mockProcessedCreate,
      count: mockProcessedCount,
    },
    whatsappWebhook: { findMany: mockWebhookFindMany },
    agentSettings: { findFirst: mockAgentSettingsFindFirst },
    whatsappChannel: { findUnique: mockChannelFindUnique },
    appSetting: { findUnique: mockAppSettingFindUnique },
  },
}));
jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 99 }),
}));
jest.mock("ioredis", () =>
  jest.fn().mockImplementation(() => ({ on: jest.fn(), connect: jest.fn(), quit: jest.fn() })),
);
jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: mockQueueAdd })),
}));

import { NextRequest } from "next/server";
import { handleWhatsappInbound, type InboundWebhookContext } from "./inbound-handler";
import { blockedMessageFor } from "./blocked-messages";

const OUTBOUND_A = {
  id: "wh-out-A",
  connectionId: "conn-A",
  targetUrl: "https://destino-do-cliente-A.example.com/hook",
  url: null,
  secret: "enc:segredo-A",
};

function corpo() {
  return {
    wa_id: "5534991908624",
    user_id: "5534991908624",
    type: "text" as const,
    text: "qual o faturamento?",
    message_id: `wamid.${Math.random().toString(36).slice(2)}`,
    timestamp: 1752080000000,
  };
}

function requisicao(body: object): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/cliente-a", {
    method: "POST",
    headers: { "Content-Type": "application/json", authorization: "Bearer token-A" },
    body: JSON.stringify(body),
  });
}

function contexto(overrides: Partial<InboundWebhookContext> = {}): InboundWebhookContext {
  return {
    secret: "token-A",
    businessId: "5511111111111",
    connectionId: "conn-A",
    connectionName: "Cliente A",
    responseMode: "n8n_webhook",
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyToken.mockReturnValue(true);
  mockQueueAdd.mockResolvedValue({ id: "job-1" });
  mockEmitAgentReply.mockResolvedValue(undefined);
  mockProcessedFindUnique.mockResolvedValue(null);
  mockProcessedCreate.mockResolvedValue({});
  mockProcessedCount.mockResolvedValue(0);
  mockAgentSettingsFindFirst.mockResolvedValue({ whatsappAccessLevel: "viewer" });
  mockAppSettingFindUnique.mockResolvedValue(null);
  mockChannelFindUnique.mockResolvedValue(null); // singleton vazio (como em produção)
  mockSendText.mockResolvedValue(undefined);
  mockBuildCloudClientFromDb.mockResolvedValue({ sendText: mockSendText });
  // O mock honra where.connectionId (senão o teste não teria poder de detecção).
  mockWebhookFindMany.mockImplementation(async (args?: { where?: { connectionId?: string } }) => {
    const todos = [OUTBOUND_A];
    const conn = args?.where?.connectionId;
    return conn ? todos.filter((w) => w.connectionId === conn) : todos;
  });
});

describe("TC.1 , fireBlocked respeita o modo efetivo da conexão", () => {
  it("modo n8n_webhook: bloqueio sai pelo webhook da conexão, não pelo cloud-client", async () => {
    mockResolveWhatsappUser.mockResolvedValue({ status: "unknown" });

    await handleWhatsappInbound(requisicao(corpo()), contexto({ responseMode: "n8n_webhook" }));

    expect(mockEmitAgentReply).toHaveBeenCalledTimes(1);
    const targets = mockEmitAgentReply.mock.calls[0][0] as Array<{ url: string }>;
    expect(targets.map((t) => t.url)).toEqual([OUTBOUND_A.targetUrl]);
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it("modo direct: bloqueio é entregue pelo cloud-client com a mensagem pronta", async () => {
    mockResolveWhatsappUser.mockResolvedValue({ status: "unknown" });
    const body = corpo();

    await handleWhatsappInbound(requisicao(body), contexto({ responseMode: "direct" }));

    expect(mockSendText).toHaveBeenCalledWith(body.wa_id, blockedMessageFor("user_not_found"));
    expect(mockEmitAgentReply).not.toHaveBeenCalled();
  });

  it("nenhum caminho disponível: registra aviso em vez de engolir em silêncio", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockResolveWhatsappUser.mockResolvedValue({ status: "unknown" });
    // Modo n8n_webhook, mas a conexão não tem destino de saída.
    mockWebhookFindMany.mockResolvedValue([]);

    await handleWhatsappInbound(requisicao(corpo()), contexto({ responseMode: "n8n_webhook" }));

    expect(mockEmitAgentReply).not.toHaveBeenCalled();
    expect(mockSendText).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("nenhum caminho"),
      expect.anything(),
    );
    warnSpy.mockRestore();
  });

  it("falha do cloud-client vira aviso, não exceção para o chamador", async () => {
    mockResolveWhatsappUser.mockResolvedValue({ status: "unknown" });
    mockBuildCloudClientFromDb.mockRejectedValue(new Error("canal não configurado"));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    const res = await handleWhatsappInbound(
      requisicao(corpo()),
      contexto({ responseMode: "direct" }),
    );

    expect(res.status).toBe(200);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("TC.2 , daily_limit_exceeded é emitido (A14)", () => {
  it("tem mensagem própria no catálogo", () => {
    const msg = blockedMessageFor("daily_limit_exceeded");
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(10);
  });

  it("quem estoura o teto diário recebe a mensagem pelo caminho da conexão", async () => {
    mockResolveWhatsappUser.mockResolvedValue({
      status: "ok",
      user: { id: "user-1", platformRole: "admin", isActive: true },
    });
    mockProcessedCount.mockResolvedValue(100); // teto default atingido

    const res = await handleWhatsappInbound(
      requisicao(corpo()),
      contexto({ responseMode: "n8n_webhook" }),
    );

    expect(res.status).toBe(200);
    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(mockEmitAgentReply).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        kind: "blocked",
        data: expect.objectContaining({
          reason: "daily_limit_exceeded",
          reply: blockedMessageFor("daily_limit_exceeded"),
        }),
      }),
    );
  });

  it("no modo direct, o aviso de teto sai pelo cloud-client", async () => {
    mockResolveWhatsappUser.mockResolvedValue({
      status: "ok",
      user: { id: "user-1", platformRole: "admin", isActive: true },
    });
    mockProcessedCount.mockResolvedValue(100);
    const body = corpo();

    await handleWhatsappInbound(requisicao(body), contexto({ responseMode: "direct" }));

    expect(mockSendText).toHaveBeenCalledWith(
      body.wa_id,
      blockedMessageFor("daily_limit_exceeded"),
    );
  });
});
