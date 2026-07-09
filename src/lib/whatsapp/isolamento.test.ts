/**
 * T0.2 , Isolamento entre Conexões de WhatsApp (SPEC v3, A1 e A1b).
 *
 * ESTES TESTES NASCEM VERMELHOS, de propósito. Eles provam a falha de segurança
 * que a Onda A vai fechar:
 *
 *   `loadOutboundTargets()` busca TODOS os webhooks de saída habilitados com
 *   `agent_reply`, sem filtrar por conexão. Com duas conexões cadastradas, a
 *   resposta (e até o "não encontrei seu número", que expõe o telefone de quem
 *   escreveu) de um cliente é entregue no destino do outro.
 *
 * O caso 2 é o pior: `fireBlocked()` roda ANTES de existir sessão, nas barreiras
 * de entrada, e também dispara sem filtro.
 *
 * Detalhe que faz o teste valer alguma coisa: o mock de `findMany` HONRA
 * `where.connectionId`. Se devolvesse `[A, B]` fixo, o teste continuaria vermelho
 * depois da correção e não provaria nada.
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

jest.mock("@/lib/whatsapp/hmac", () => ({ verifyToken: mockVerifyToken }));
jest.mock("@/lib/whatsapp/resolve", () => ({ resolveWhatsappUser: mockResolveWhatsappUser }));
jest.mock("@/lib/whatsapp/emit-reply", () => ({ emitAgentReply: mockEmitAgentReply }));
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
import { handleWhatsappInbound } from "./inbound-handler";

// ── Duas conexões, cada uma com o SEU destino ────────────────────────────────
const CONEXAO_A = {
  id: "conn-A",
  nome: "Cliente A",
  businessId: "5511111111111",
  secret: "token-A",
};
const CONEXAO_B = {
  id: "conn-B",
  nome: "Cliente B",
  businessId: "5522222222222",
  secret: "token-B",
};

const OUTBOUND_A = {
  id: "wh-out-A",
  connectionId: CONEXAO_A.id,
  targetUrl: "https://destino-do-cliente-A.example.com/hook",
  url: null,
  secret: "enc:segredo-A",
};
const OUTBOUND_B = {
  id: "wh-out-B",
  connectionId: CONEXAO_B.id,
  targetUrl: "https://destino-do-cliente-B.example.com/hook",
  url: null,
  secret: "enc:segredo-B",
};

/** Corpo válido segundo o schema Zod de entrada. */
function corpo(waId = "5534991908624") {
  return {
    wa_id: waId,
    user_id: waId,
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

/** Contexto do webhook de entrada da conexão A. */
function contextoDaConexaoA() {
  return {
    secret: CONEXAO_A.secret,
    businessId: CONEXAO_A.businessId,
    // Campos que a Onda A introduz. Enquanto não existirem, o handler ignora e
    // o disparo sai sem filtro , que é justamente o bug provado aqui.
    connectionId: CONEXAO_A.id,
    connectionName: CONEXAO_A.nome,
  } as Parameters<typeof handleWhatsappInbound>[1];
}

/** Alvos entregues a `emitAgentReply` (ou ao job) numa chamada. */
function urlsDosTargets(targets: Array<{ url: string }>): string[] {
  return targets.map((t) => t.url).sort();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyToken.mockReturnValue(true);
  // O handler usa `job.id` e encadeia `.catch()` no emit: os mocks precisam
  // devolver as mesmas formas, senão o teste falha por setup e não pelo bug.
  mockQueueAdd.mockResolvedValue({ id: "job-1" });
  mockEmitAgentReply.mockResolvedValue(undefined);
  mockProcessedFindUnique.mockResolvedValue(null);
  mockProcessedCreate.mockResolvedValue({});
  mockProcessedCount.mockResolvedValue(0);
  mockAgentSettingsFindFirst.mockResolvedValue({ whatsappAccessLevel: "viewer" });
  mockAppSettingFindUnique.mockResolvedValue(null);
  // modo de resposta por webhook (o singleton não existe em produção)
  mockChannelFindUnique.mockResolvedValue({ responseMode: "n8n_webhook" });

  // O mock HONRA `where.connectionId`. Sem isso, o teste não teria poder de
  // detecção: continuaria vermelho mesmo depois da correção.
  mockWebhookFindMany.mockImplementation(async (args?: { where?: { connectionId?: string } }) => {
    const todos = [OUTBOUND_A, OUTBOUND_B];
    const conn = args?.where?.connectionId;
    return conn ? todos.filter((w) => w.connectionId === conn) : todos;
  });
});

describe("isolamento entre conexões , resposta final (SPEC A1)", () => {
  it("mensagem para a conexão A enfileira SÓ o destino de A", async () => {
    mockResolveWhatsappUser.mockResolvedValue({
      status: "ok",
      user: { id: "user-1", platformRole: "super_admin", isActive: true },
    });

    const res = await handleWhatsappInbound(requisicao(corpo()), contextoDaConexaoA());
    expect(res.status).toBe(202);

    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
    const jobData = mockQueueAdd.mock.calls[0][1];
    const targets = jobData.channelConfig?.outboundTargets ?? [];

    // HOJE: vem [A, B] , a resposta do cliente A vaza para o destino do B.
    expect(urlsDosTargets(targets)).toEqual([OUTBOUND_A.targetUrl]);
  });
});

describe("isolamento entre conexões , mensagem de bloqueio (SPEC A1b)", () => {
  it("'número não encontrado' na conexão A dispara SÓ para o destino de A", async () => {
    // Barreira L1: roda antes de existir sessão, e hoje dispara sem filtro.
    mockResolveWhatsappUser.mockResolvedValue({ status: "not_found" });

    const res = await handleWhatsappInbound(requisicao(corpo()), contextoDaConexaoA());
    expect(res.status).toBe(200);

    expect(mockEmitAgentReply).toHaveBeenCalledTimes(1);
    const targets = mockEmitAgentReply.mock.calls[0][0];

    // HOJE: vem [A, B]. O destino do cliente B recebe o telefone de quem
    // escreveu para o cliente A. É vazamento de dado pessoal entre clientes.
    expect(urlsDosTargets(targets)).toEqual([OUTBOUND_A.targetUrl]);
  });

  it("o payload do bloqueio identifica a conexão que recebeu a mensagem", async () => {
    mockResolveWhatsappUser.mockResolvedValue({ status: "not_found" });

    await handleWhatsappInbound(requisicao(corpo()), contextoDaConexaoA());

    const envelope = mockEmitAgentReply.mock.calls[0][1];
    expect(envelope.kind).toBe("blocked");
    expect(envelope.data.reason).toBe("user_not_found");
    expect(envelope.data.businessId).toBe(CONEXAO_A.businessId);
  });
});
