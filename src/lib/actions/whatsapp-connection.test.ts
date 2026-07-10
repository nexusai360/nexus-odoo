/**
 * Onda F , Ações da Conexão com WhatsApp (SPEC §3.6).
 *
 * Uma Conexão = DUAS linhas em whatsapp_webhooks (recebimento + envio) ligadas
 * pelo mesmo connection_id, operadas como UMA coisa: criar grava as duas numa
 * transação, apagar remove as duas, rotacionar troca o token de UMA ponta,
 * listar agrupa por connection_id.
 */

// ── Mocks (antes de qualquer import) ─────────────────────────────────────────
const mockGetCurrentUser = jest.fn();
const mockFindFirst = jest.fn();
const mockFindMany = jest.fn();
const mockFindUnique = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockUpdateMany = jest.fn();
const mockDeleteMany = jest.fn();
const mockTransaction = jest.fn();
const mockLogAudit = jest.fn();
const mockRevalidatePath = jest.fn();
const mockVerificarNumeroParaConexao = jest.fn();

jest.mock("@/lib/auth", () => ({ getCurrentUser: mockGetCurrentUser }));
jest.mock("@/lib/audit", () => ({ logAudit: mockLogAudit }));
jest.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
jest.mock("@/lib/encryption", () => ({
  encrypt: jest.fn((s: string) => `enc:${s}`),
  decrypt: jest.fn((s: string) => s.replace("enc:", "")),
}));
jest.mock("@/lib/whatsapp/numero-unico", () => ({
  verificarNumeroParaConexao: mockVerificarNumeroParaConexao,
}));

const txMock = {
  whatsappWebhook: {
    create: mockCreate,
    update: mockUpdate,
    updateMany: mockUpdateMany,
    deleteMany: mockDeleteMany,
  },
};

jest.mock("@/lib/prisma", () => ({
  prisma: {
    whatsappWebhook: {
      findFirst: mockFindFirst,
      findMany: mockFindMany,
      findUnique: mockFindUnique,
      create: mockCreate,
      update: mockUpdate,
      updateMany: mockUpdateMany,
      deleteMany: mockDeleteMany,
    },
    $transaction: mockTransaction,
  },
}));

import {
  prepararTokensConexao,
  criarConexaoWhatsapp,
  atualizarConexaoWhatsapp,
  alternarConexaoWhatsapp,
  apagarConexaoWhatsapp,
  rotacionarTokenConexao,
  listConnections,
} from "./whatsapp-connection";

const SUPER_ADMIN = { id: "user-sa", name: "Admin", platformRole: "super_admin", isActive: true };
const ADMIN = { id: "user-a", name: "Gestor", platformRole: "admin", isActive: true };

const INPUT_VALIDO = {
  name: "Matrix Group",
  description: "Conexão principal",
  path: "matrixgroup",
  businessId: "5561995630029",
  targetUrl: "https://fluxo.exemplo.com.br/hook",
  tokenRecebimento: "a".repeat(64),
  tokenAssinatura: "b".repeat(64),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(SUPER_ADMIN);
  mockFindFirst.mockResolvedValue(null); // slug livre
  mockFindMany.mockResolvedValue([]);
  mockFindUnique.mockResolvedValue(null);
  mockVerificarNumeroParaConexao.mockResolvedValue({ ok: true });
  mockCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
    id: `id-${args.data.direction}`,
    ...args.data,
  }));
  mockUpdate.mockResolvedValue({});
  mockUpdateMany.mockResolvedValue({ count: 2 });
  mockDeleteMany.mockResolvedValue({ count: 2 });
  mockTransaction.mockImplementation(async (fn: (tx: typeof txMock) => Promise<unknown>) =>
    fn(txMock),
  );
});

// ── prepararTokensConexao , tokens da tela (um por etapa) ────────────────────

describe("prepararTokensConexao", () => {
  it("gera dois tokens distintos com entropia mínima, SEM efeito colateral", async () => {
    const r = await prepararTokensConexao();
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.tokenRecebimento).not.toBe(r.data.tokenAssinatura);
      expect(r.data.tokenRecebimento.length).toBeGreaterThanOrEqual(32);
      expect(r.data.tokenAssinatura.length).toBeGreaterThanOrEqual(32);
    }
    // Nada é persistido: os tokens só passam a valer quando a conexão é criada.
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("só super_admin", async () => {
    mockGetCurrentUser.mockResolvedValue(ADMIN);
    const r = await prepararTokensConexao();
    expect(r.success).toBe(false);
  });
});

// ── TF.1 , criarConexaoWhatsapp ──────────────────────────────────────────────

describe("criarConexaoWhatsapp", () => {
  it("TF.1b: grava DUAS linhas com o MESMO connection_id numa transação", async () => {
    const r = await criarConexaoWhatsapp(INPUT_VALIDO);
    expect(r.success).toBe(true);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledTimes(2);

    const criadas = mockCreate.mock.calls.map(
      (c) => (c[0] as { data: Record<string, unknown> }).data,
    );
    const inbound = criadas.find((d) => d.direction === "inbound")!;
    const outbound = criadas.find((d) => d.direction === "outbound")!;

    expect(inbound.connectionId).toBeDefined();
    expect(inbound.connectionId).toBe(outbound.connectionId);

    // Recebimento: slug + número + token da etapa 1 + modo gravado (A13).
    expect(inbound.path).toBe("matrixgroup");
    expect(inbound.secret).toBe(`enc:${INPUT_VALIDO.tokenRecebimento}`);
    expect(inbound.businessId).toBe(INPUT_VALIDO.businessId);
    expect(inbound.isWhatsappReceiver).toBe(true);
    expect(inbound.responseMode).toBe("n8n_webhook");
    expect(inbound.events).toEqual([]);

    // Envio: url E targetUrl (loadOutboundTargets lê targetUrl ?? url),
    // businessId NULO (A9: único na tabela), agent_reply.
    expect(outbound.targetUrl).toBe(INPUT_VALIDO.targetUrl);
    expect(outbound.url).toBe(INPUT_VALIDO.targetUrl);
    expect(outbound.businessId).toBeNull();
    expect(outbound.events).toEqual(["agent_reply"]);
    expect(outbound.secret).toBe(`enc:${INPUT_VALIDO.tokenAssinatura}`);
    expect(outbound.responseMode).toBeNull();
  });

  it("persiste exatamente os tokens que a tela exibiu em cada etapa (cifrados)", async () => {
    const r = await criarConexaoWhatsapp(INPUT_VALIDO);
    expect(r.success).toBe(true);

    const criadas = mockCreate.mock.calls.map(
      (c) => (c[0] as { data: Record<string, unknown> }).data,
    );
    expect(criadas.find((d) => d.direction === "inbound")!.secret).toBe(
      `enc:${INPUT_VALIDO.tokenRecebimento}`,
    );
    expect(criadas.find((d) => d.direction === "outbound")!.secret).toBe(
      `enc:${INPUT_VALIDO.tokenAssinatura}`,
    );
  });

  it("recusa token curto demais (o formulário nunca deve mandar isso)", async () => {
    const r = await criarConexaoWhatsapp({ ...INPUT_VALIDO, tokenRecebimento: "curto" });
    expect(r.success).toBe(false);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("TF.1a: só super_admin", async () => {
    mockGetCurrentUser.mockResolvedValue(ADMIN);
    const r = await criarConexaoWhatsapp(INPUT_VALIDO);
    expect(r.success).toBe(false);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("TF.1a: recusa slug já usado", async () => {
    // Só a consulta por `path` acha algo; a de nome continua livre.
    mockFindFirst.mockImplementation(async (args: { where?: { path?: string } }) =>
      args?.where?.path ? { id: "outro" } : null,
    );
    const r = await criarConexaoWhatsapp(INPUT_VALIDO);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("caminho");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("recusa NOME já usado por outro webhook, sem diferenciar maiúsculas", async () => {
    mockFindFirst.mockImplementation(async (args: { where?: { name?: unknown } }) =>
      args?.where?.name ? { id: "outro-webhook" } : null,
    );
    const r = await criarConexaoWhatsapp(INPUT_VALIDO);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("Já existe um webhook com o nome");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("a busca por nome é case-insensitive", async () => {
    await criarConexaoWhatsapp(INPUT_VALIDO);
    const chamadaNome = mockFindFirst.mock.calls.find(
      (c) => (c[0] as { where?: { name?: unknown } })?.where?.name,
    );
    expect(chamadaNome).toBeDefined();
    expect((chamadaNome![0] as { where: { name: unknown } }).where.name).toEqual({
      equals: INPUT_VALIDO.name,
      mode: "insensitive",
    });
  });

  it("TF.1a: recusa URL de destino inválida", async () => {
    const r = await criarConexaoWhatsapp({ ...INPUT_VALIDO, targetUrl: "não é url" });
    expect(r.success).toBe(false);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("TF.1c: recusa número travado (canal direto ou outra conexão), com a mensagem da trava", async () => {
    mockVerificarNumeroParaConexao.mockResolvedValue({
      ok: false,
      error: "Já existe uma conexão de WhatsApp usando este número (Cliente B). Edite essa conexão ou use outro número.",
    });

    const r = await criarConexaoWhatsapp(INPUT_VALIDO);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("Cliente B");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("TF.1d: audita e revalida a rota de webhooks", async () => {
    await criarConexaoWhatsapp(INPUT_VALIDO);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "whatsapp_connection_created" }),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/integracoes/webhooks");
  });
});

// ── TG.7a/TG.7b , atualizarConexaoWhatsapp ───────────────────────────────────

describe("atualizarConexaoWhatsapp", () => {
  const CONN_ID = "44444444-4444-4444-4444-444444444444";
  const LINHA_IN = {
    id: "wh-in",
    direction: "inbound",
    name: "Matrix Group",
    description: null,
    path: "matrixgroup",
    businessId: "5561995630029",
    connectionId: CONN_ID,
    responseMode: null,
  };
  const LINHA_OUT = {
    id: "wh-out",
    direction: "outbound",
    name: "Matrix Group",
    description: null,
    targetUrl: "https://antigo.example.com/hook",
    url: "https://antigo.example.com/hook",
    connectionId: CONN_ID,
  };

  const EDICAO = {
    name: "Matrix Group",
    description: "Conexão principal",
    path: "matrixgroup",
    businessId: "5561995630029",
    targetUrl: "https://novo.example.com/hook",
  };

  beforeEach(() => {
    // Sem conflito de slug; a conexão tem as duas linhas por padrão.
    mockFindFirst.mockResolvedValue(null);
    mockFindMany.mockResolvedValue([LINHA_IN, LINHA_OUT]);
    mockUpdate.mockResolvedValue({});
  });

  it("nome e descrição são gravados nas DUAS linhas", async () => {
    const r = await atualizarConexaoWhatsapp(CONN_ID, EDICAO);
    expect(r.success).toBe(true);

    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { connectionId: CONN_ID },
        data: expect.objectContaining({
          name: EDICAO.name,
          description: EDICAO.description,
        }),
      }),
    );
  });

  it("TG.7b: destino configurado grava responseMode=n8n_webhook na linha de recebimento (era NULL do backfill)", async () => {
    const r = await atualizarConexaoWhatsapp(CONN_ID, EDICAO);
    expect(r.success).toBe(true);

    const updateInbound = mockUpdate.mock.calls.find(
      (c) => (c[0] as { where: { id: string } }).where.id === "wh-in",
    );
    expect(updateInbound).toBeDefined();
    expect((updateInbound![0] as { data: Record<string, unknown> }).data).toEqual(
      expect.objectContaining({ responseMode: "n8n_webhook" }),
    );
  });

  it("TG.7b: conexão SEM linha de envio + destino novo cria a linha outbound e devolve o token de assinatura 1x", async () => {
    mockFindMany.mockResolvedValue([LINHA_IN]);

    const r = await atualizarConexaoWhatsapp(CONN_ID, EDICAO);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.novoTokenAssinatura).toBeDefined();
      expect(r.data.novoTokenAssinatura!.length).toBeGreaterThanOrEqual(32);
    }

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          direction: "outbound",
          connectionId: CONN_ID,
          targetUrl: EDICAO.targetUrl,
          url: EDICAO.targetUrl,
          events: ["agent_reply"],
          businessId: null,
        }),
      }),
    );
  });

  it("sem mexer no destino, o token de assinatura não muda e nada novo é criado", async () => {
    const r = await atualizarConexaoWhatsapp(CONN_ID, EDICAO);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.novoTokenAssinatura).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("a trava de NOME ignora as duas linhas da própria conexão na edição", async () => {
    await atualizarConexaoWhatsapp(CONN_ID, EDICAO);
    const chamadaNome = mockFindFirst.mock.calls.find(
      (c) => (c[0] as { where?: { name?: unknown } })?.where?.name,
    );
    expect(chamadaNome).toBeDefined();
    expect((chamadaNome![0] as { where: { connectionId?: unknown } }).where.connectionId).toEqual({
      not: CONN_ID,
    });
  });

  it("a trava de número ignora a própria conexão na edição", async () => {
    await atualizarConexaoWhatsapp(CONN_ID, EDICAO);
    expect(mockVerificarNumeroParaConexao).toHaveBeenCalledWith(
      EDICAO.businessId,
      expect.objectContaining({ ignorarConnectionId: CONN_ID }),
    );
  });

  it("número travado é recusado com a mensagem da trava", async () => {
    mockVerificarNumeroParaConexao.mockResolvedValue({
      ok: false,
      error: "Este número já está configurado no envio direto pela Meta. Remova de lá antes de criar a conexão, ou use outro número.",
    });
    const r = await atualizarConexaoWhatsapp(CONN_ID, EDICAO);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("envio direto");
  });

  it("conexão inexistente falha claro", async () => {
    mockFindMany.mockResolvedValue([]);
    const r = await atualizarConexaoWhatsapp(CONN_ID, EDICAO);
    expect(r.success).toBe(false);
  });

  it("só super_admin", async () => {
    mockGetCurrentUser.mockResolvedValue(ADMIN);
    const r = await atualizarConexaoWhatsapp(CONN_ID, EDICAO);
    expect(r.success).toBe(false);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("audita e revalida", async () => {
    await atualizarConexaoWhatsapp(CONN_ID, EDICAO);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "whatsapp_connection_updated" }),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/integracoes/webhooks");
  });
});

// ── TF.2 , apagarConexaoWhatsapp ─────────────────────────────────────────────

describe("apagarConexaoWhatsapp", () => {
  const CONN_ID = "11111111-1111-1111-1111-111111111111";

  beforeEach(() => {
    mockFindMany.mockResolvedValue([
      { id: "wh-in", direction: "inbound", name: "Matrix Group" },
      { id: "wh-out", direction: "outbound", name: "Matrix Group" },
    ]);
  });

  it("apaga as DUAS linhas numa transação", async () => {
    const r = await apagarConexaoWhatsapp(CONN_ID);
    expect(r.success).toBe(true);
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { connectionId: CONN_ID } });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "whatsapp_connection_deleted" }),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/integracoes/webhooks");
  });

  it("conexão inexistente falha claro", async () => {
    mockFindMany.mockResolvedValue([]);
    const r = await apagarConexaoWhatsapp(CONN_ID);
    expect(r.success).toBe(false);
  });

  it("só super_admin", async () => {
    mockGetCurrentUser.mockResolvedValue(ADMIN);
    const r = await apagarConexaoWhatsapp(CONN_ID);
    expect(r.success).toBe(false);
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });
});

// ── TF.3 , rotacionarTokenConexao ────────────────────────────────────────────

describe("rotacionarTokenConexao", () => {
  const CONN_ID = "11111111-1111-1111-1111-111111111111";

  beforeEach(() => {
    mockFindFirst.mockImplementation(
      async (args: { where?: { direction?: string } }) => {
        if (args?.where?.direction === "inbound") return { id: "wh-in" };
        if (args?.where?.direction === "outbound") return { id: "wh-out" };
        return null;
      },
    );
  });

  it("rotaciona o token de RECEBIMENTO (linha inbound) e devolve o valor 1x", async () => {
    const r = await rotacionarTokenConexao(CONN_ID, "recebimento");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.secretPlain.length).toBeGreaterThanOrEqual(32);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "wh-in" } }),
    );
  });

  it("rotaciona o token de ASSINATURA (linha outbound), independente do outro", async () => {
    const r = await rotacionarTokenConexao(CONN_ID, "assinatura");
    expect(r.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "wh-out" } }),
    );
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("audita com a ponta rotacionada", async () => {
    await rotacionarTokenConexao(CONN_ID, "assinatura");
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "whatsapp_connection_token_rotated",
        details: expect.objectContaining({ ponta: "assinatura" }),
      }),
    );
  });

  it("ponta sem linha correspondente falha claro", async () => {
    mockFindFirst.mockResolvedValue(null);
    const r = await rotacionarTokenConexao(CONN_ID, "assinatura");
    expect(r.success).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("só super_admin", async () => {
    mockGetCurrentUser.mockResolvedValue(ADMIN);
    const r = await rotacionarTokenConexao(CONN_ID, "recebimento");
    expect(r.success).toBe(false);
  });
});

// ── alternarConexaoWhatsapp ──────────────────────────────────────────────────

describe("alternarConexaoWhatsapp", () => {
  const CONN_ID = "55555555-5555-5555-5555-555555555555";

  it("liga/desliga as DUAS linhas da conexão", async () => {
    mockUpdateMany.mockResolvedValue({ count: 2 });
    const r = await alternarConexaoWhatsapp(CONN_ID, false);
    expect(r.success).toBe(true);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { connectionId: CONN_ID },
      data: { enabled: false },
    });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "whatsapp_connection_updated",
        details: expect.objectContaining({ enabled: false }),
      }),
    );
  });

  it("conexão inexistente falha claro", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    const r = await alternarConexaoWhatsapp(CONN_ID, true);
    expect(r.success).toBe(false);
  });

  it("só super_admin", async () => {
    mockGetCurrentUser.mockResolvedValue(ADMIN);
    const r = await alternarConexaoWhatsapp(CONN_ID, true);
    expect(r.success).toBe(false);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});

// ── TF.4 , listConnections ───────────────────────────────────────────────────

describe("listConnections", () => {
  it("duas linhas com o mesmo connection_id viram UMA conexão", async () => {
    const connId = "22222222-2222-2222-2222-222222222222";
    mockFindMany.mockResolvedValue([
      {
        id: "wh-in",
        direction: "inbound",
        name: "Matrix Group",
        description: "desc",
        path: "matrixgroup",
        targetUrl: null,
        url: null,
        businessId: "5561995630029",
        connectionId: connId,
        responseMode: "n8n_webhook",
        isWhatsappReceiver: true,
        secret: "enc:tok-rec",
        enabled: true,
        methods: ["POST"],
        events: [],
        createdAt: new Date("2026-07-09"),
      },
      {
        id: "wh-out",
        direction: "outbound",
        name: "Matrix Group",
        description: "desc",
        path: null,
        targetUrl: "https://fluxo.exemplo.com.br/hook",
        url: "https://fluxo.exemplo.com.br/hook",
        businessId: null,
        connectionId: connId,
        responseMode: null,
        isWhatsappReceiver: false,
        secret: "enc:tok-ass",
        enabled: true,
        methods: ["POST"],
        events: ["agent_reply"],
        createdAt: new Date("2026-07-09"),
      },
    ]);

    const r = await listConnections();
    expect(r.success).toBe(true);
    if (!r.success) return;

    expect(r.data.conexoes).toHaveLength(1);
    const c = r.data.conexoes[0];
    expect(c.connectionId).toBe(connId);
    expect(c.name).toBe("Matrix Group");
    expect(c.path).toBe("matrixgroup");
    expect(c.businessId).toBe("5561995630029");
    expect(c.targetUrl).toBe("https://fluxo.exemplo.com.br/hook");
    expect(c.inboundId).toBe("wh-in");
    expect(c.outboundId).toBe("wh-out");
    expect(r.data.avulsos).toHaveLength(0);
  });

  it("conexão do backfill (sem linha de envio) aparece com envio pendente", async () => {
    const connId = "33333333-3333-3333-3333-333333333333";
    mockFindMany.mockResolvedValue([
      {
        id: "wh-in",
        direction: "inbound",
        name: "Matrix Group",
        description: null,
        path: "matrixgroup",
        targetUrl: null,
        url: null,
        businessId: "5561995630029",
        connectionId: connId,
        responseMode: null,
        isWhatsappReceiver: true,
        secret: "enc:tok",
        enabled: true,
        methods: ["POST"],
        events: [],
        createdAt: new Date("2026-07-09"),
      },
    ]);

    const r = await listConnections();
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.conexoes).toHaveLength(1);
    expect(r.data.conexoes[0].outboundId).toBeNull();
    expect(r.data.conexoes[0].targetUrl).toBeNull();
  });

  it("webhooks sem connection_id continuam como avulsos", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "wh-solto",
        direction: "outbound",
        name: "Webhook genérico",
        description: null,
        path: null,
        targetUrl: "https://x.example.com",
        url: null,
        businessId: null,
        connectionId: null,
        responseMode: null,
        isWhatsappReceiver: false,
        secret: "enc:s",
        enabled: true,
        methods: ["POST"],
        events: [],
        createdAt: new Date("2026-07-01"),
      },
    ]);

    const r = await listConnections();
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.conexoes).toHaveLength(0);
    expect(r.data.avulsos).toHaveLength(1);
    expect(r.data.avulsos[0].id).toBe("wh-solto");
  });
});
