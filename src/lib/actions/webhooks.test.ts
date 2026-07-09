/**
 * Testes das Server Actions de webhooks.
 * TDD: testes escritos antes da implementação.
 * Gate: super_admin.
 * Secret cifrado com AES-256-GCM.
 */

// ──────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────

const mockGetCurrentUser = jest.fn();
const mockPrismaWebhookFindMany = jest.fn();
const mockPrismaWebhookFindFirst = jest.fn();
const mockPrismaWebhookFindUnique = jest.fn();
const mockPrismaWebhookCreate = jest.fn();
const mockPrismaWebhookUpdate = jest.fn();
const mockPrismaWebhookDelete = jest.fn();
const mockEncrypt = jest.fn((s: string) => `enc:${s}`);
const mockDecrypt = jest.fn((s: string) => s.replace("enc:", ""));
const mockLogAudit = jest.fn();
const mockRevalidatePath = jest.fn();

jest.mock("@/lib/auth", () => ({ getCurrentUser: mockGetCurrentUser }));
jest.mock("@/lib/encryption", () => ({
  encrypt: mockEncrypt,
  decrypt: mockDecrypt,
}));
jest.mock("@/lib/audit", () => ({ logAudit: mockLogAudit }));
jest.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
// `menuAccess` é lido pela guarda das ações (o nível do menu Integrações decide
// quem gerencia webhooks comuns). Sem linhas, valem os defaults do catálogo,
// nos quais Integrações exige super_admin , o mesmo gate que estes testes assumem.
const mockPrismaMenuAccessFindMany = jest.fn(async () => []);
jest.mock("@/lib/prisma", () => ({
  prisma: {
    whatsappWebhook: {
      findMany: mockPrismaWebhookFindMany,
      findFirst: mockPrismaWebhookFindFirst,
      findUnique: mockPrismaWebhookFindUnique,
      create: mockPrismaWebhookCreate,
      update: mockPrismaWebhookUpdate,
      delete: mockPrismaWebhookDelete,
    },
    menuAccess: {
      findMany: mockPrismaMenuAccessFindMany,
    },
  },
}));

// ──────────────────────────────────────────────
// Import após mocks
// ──────────────────────────────────────────────

import {
  createWebhook,
  updateWebhook,
  listWebhooks,
  rotateWebhookSecret,
  toggleWebhook,
  deleteWebhook,
} from "./webhooks";

// ──────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────

const SUPER_ADMIN = {
  id: "user-sa",
  name: "Admin",
  platformRole: "super_admin",
  isActive: true,
};
const REGULAR_USER = {
  id: "user-r",
  name: "User",
  platformRole: "admin",
  isActive: true,
};

const WEBHOOK_ROW = {
  id: "wh-1",
  direction: "inbound",
  name: "Receptor WhatsApp",
  url: null,
  path: "whatsapp/inbound",
  targetUrl: null,
  methods: ["POST"],
  secret: "enc:mysecret",
  enabled: true,
  createdAt: new Date("2026-05-01"),
};

const WEBHOOK_ROW_OUTBOUND = {
  id: "wh-2",
  direction: "outbound",
  name: "Callback n8n",
  url: "https://n8n.example.com/webhook/xyz",
  path: null,
  targetUrl: "https://n8n.example.com/webhook/xyz",
  methods: ["POST"],
  secret: "enc:othersecret",
  enabled: false,
  createdAt: new Date("2026-05-02"),
};

const INBOUND_INPUT = {
  direction: "inbound" as const,
  name: "Receptor WhatsApp",
  path: "whatsapp/inbound",
  methods: ["POST" as const],
};

const OUTBOUND_INPUT = {
  direction: "outbound" as const,
  name: "Callback n8n",
  targetUrl: "https://n8n.example.com/webhook/xyz",
  methods: ["POST" as const],
};

// ──────────────────────────────────────────────
// Setup
// ──────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(SUPER_ADMIN);
  mockPrismaWebhookFindMany.mockResolvedValue([WEBHOOK_ROW, WEBHOOK_ROW_OUTBOUND]);
  mockPrismaWebhookFindFirst.mockResolvedValue(null);
  mockPrismaWebhookFindUnique.mockResolvedValue({ id: "wh-1", direction: "inbound" });
  mockPrismaWebhookCreate.mockResolvedValue(WEBHOOK_ROW);
  mockPrismaWebhookUpdate.mockResolvedValue({ ...WEBHOOK_ROW });
  mockPrismaWebhookDelete.mockResolvedValue(WEBHOOK_ROW);
});

// ──────────────────────────────────────────────
// createWebhook
// ──────────────────────────────────────────────

describe("createWebhook", () => {
  it("cria um webhook com secret cifrado", async () => {
    const result = await createWebhook(INBOUND_INPUT);
    expect(result.success).toBe(true);
    // O secret deve ser cifrado antes de gravar
    expect(mockEncrypt).toHaveBeenCalled();
    const createCall = mockPrismaWebhookCreate.mock.calls[0][0];
    expect(createCall.data.secret).toMatch(/^enc:/);
  });

  it("retorna o secret em claro ao criar para exibição inicial", async () => {
    mockPrismaWebhookCreate.mockResolvedValue(WEBHOOK_ROW_OUTBOUND);
    const result = await createWebhook(OUTBOUND_INPUT);
    expect(result.success).toBe(true);
    if (result.success) {
      // Deve retornar o secret em claro para exibição única
      expect(result.data.secretPlain).toBeDefined();
      expect(typeof result.data.secretPlain).toBe("string");
      expect(result.data.secretPlain.length).toBeGreaterThan(8);
    }
  });

  it("persiste path para inbound e targetUrl para outbound", async () => {
    await createWebhook(INBOUND_INPUT);
    expect(mockPrismaWebhookCreate.mock.calls[0][0].data.path).toBe(
      "whatsapp/inbound",
    );
    expect(mockPrismaWebhookCreate.mock.calls[0][0].data.targetUrl).toBeNull();

    mockPrismaWebhookCreate.mockClear();
    await createWebhook(OUTBOUND_INPUT);
    expect(mockPrismaWebhookCreate.mock.calls[0][0].data.targetUrl).toBe(
      "https://n8n.example.com/webhook/xyz",
    );
    expect(mockPrismaWebhookCreate.mock.calls[0][0].data.path).toBeNull();
  });

  it("retorna erro para usuário sem permissão", async () => {
    mockGetCurrentUser.mockResolvedValue(REGULAR_USER);
    const result = await createWebhook(INBOUND_INPUT);
    expect(result.success).toBe(false);
    expect(mockPrismaWebhookCreate).not.toHaveBeenCalled();
  });

  it("retorna erro quando não autenticado", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const result = await createWebhook(INBOUND_INPUT);
    expect(result.success).toBe(false);
  });

  it("valida direction inválido", async () => {
    const result = await createWebhook({
      ...INBOUND_INPUT,
      direction: "invalid" as "inbound",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita path inseguro em webhook de entrada", async () => {
    const result = await createWebhook({ ...INBOUND_INPUT, path: "../etc" });
    expect(result.success).toBe(false);
  });

  it("rejeita lista de métodos vazia", async () => {
    const result = await createWebhook({ ...INBOUND_INPUT, methods: [] });
    expect(result.success).toBe(false);
  });

  it("outbound sem events nasce com default agent_reply (F5 D)", async () => {
    mockPrismaWebhookCreate.mockResolvedValue(WEBHOOK_ROW_OUTBOUND);
    await createWebhook(OUTBOUND_INPUT);
    expect(mockPrismaWebhookCreate.mock.calls[0][0].data.events).toEqual([
      "agent_reply",
    ]);
  });

  it("outbound com events:[] grava vazio (F5 D)", async () => {
    mockPrismaWebhookCreate.mockResolvedValue(WEBHOOK_ROW_OUTBOUND);
    await createWebhook({ ...OUTBOUND_INPUT, events: [] });
    expect(mockPrismaWebhookCreate.mock.calls[0][0].data.events).toEqual([]);
  });

  it("inbound ignora events (sempre vazio) (F5 D)", async () => {
    await createWebhook({ ...INBOUND_INPUT, events: ["agent_reply"] });
    expect(mockPrismaWebhookCreate.mock.calls[0][0].data.events).toEqual([]);
  });

  it("receptor de WhatsApp sem número da empresa falha (F5.1)", async () => {
    const result = await createWebhook({ ...INBOUND_INPUT, isWhatsappReceiver: true });
    expect(result.success).toBe(false);
    expect(mockPrismaWebhookCreate).not.toHaveBeenCalled();
  });

  it("receptor de WhatsApp persiste flag + business_id e descricao (F5.1)", async () => {
    const result = await createWebhook({
      ...INBOUND_INPUT,
      isWhatsappReceiver: true,
      businessId: "556195630029",
      description: "Recebe mensagens da loja matriz",
    });
    expect(result.success).toBe(true);
    const data = mockPrismaWebhookCreate.mock.calls[0][0].data;
    expect(data.isWhatsappReceiver).toBe(true);
    expect(data.businessId).toBe("556195630029");
    expect(data.description).toBe("Recebe mensagens da loja matriz");
  });

  it("bloqueia business_id duplicado entre receptores (F5.1)", async () => {
    // 1a chamada de findFirst (path) => null; 2a (businessId) => existe.
    mockPrismaWebhookFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "wh-existente" });
    const result = await createWebhook({
      ...INBOUND_INPUT,
      isWhatsappReceiver: true,
      businessId: "556195630029",
    });
    expect(result.success).toBe(false);
    expect(mockPrismaWebhookCreate).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────
// listWebhooks
// ──────────────────────────────────────────────

describe("listWebhooks", () => {
  it("retorna lista de webhooks sem expor o secret", async () => {
    const result = await listWebhooks();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
      // Não expõe secret (nem cifrado nem em claro)
      for (const wh of result.data) {
        expect(wh).not.toHaveProperty("secret");
        expect(wh).not.toHaveProperty("secretPlain");
      }
    }
  });

  it("retorna erro para usuário sem permissão", async () => {
    mockGetCurrentUser.mockResolvedValue(REGULAR_USER);
    const result = await listWebhooks();
    expect(result.success).toBe(false);
  });

  it("retorna erro quando não autenticado", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const result = await listWebhooks();
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// rotateWebhookSecret
// ──────────────────────────────────────────────

describe("rotateWebhookSecret", () => {
  it("gera novo secret, cifra e grava", async () => {
    const result = await rotateWebhookSecret("wh-1");
    expect(result.success).toBe(true);
    expect(mockEncrypt).toHaveBeenCalled();
    const updateCall = mockPrismaWebhookUpdate.mock.calls[0][0];
    expect(updateCall.data.secret).toMatch(/^enc:/);
  });

  it("retorna o novo secret em claro uma vez", async () => {
    const result = await rotateWebhookSecret("wh-1");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.secretPlain).toBeDefined();
      expect(result.data.secretPlain.length).toBeGreaterThan(8);
    }
  });

  it("retorna erro para usuário sem permissão", async () => {
    mockGetCurrentUser.mockResolvedValue(REGULAR_USER);
    const result = await rotateWebhookSecret("wh-1");
    expect(result.success).toBe(false);
    expect(mockPrismaWebhookUpdate).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────
// toggleWebhook
// ──────────────────────────────────────────────

describe("toggleWebhook", () => {
  it("habilita/desabilita webhook", async () => {
    const result = await toggleWebhook("wh-1", false);
    expect(result.success).toBe(true);
    expect(mockPrismaWebhookUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wh-1" },
        data: { enabled: false },
      }),
    );
  });

  it("retorna erro para usuário sem permissão", async () => {
    mockGetCurrentUser.mockResolvedValue(REGULAR_USER);
    const result = await toggleWebhook("wh-1", true);
    expect(result.success).toBe(false);
    expect(mockPrismaWebhookUpdate).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────
// deleteWebhook
// ──────────────────────────────────────────────

describe("deleteWebhook", () => {
  it("deleta webhook", async () => {
    const result = await deleteWebhook("wh-1");
    expect(result.success).toBe(true);
    expect(mockPrismaWebhookDelete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "wh-1" } }),
    );
  });

  it("retorna erro para usuário sem permissão", async () => {
    mockGetCurrentUser.mockResolvedValue(REGULAR_USER);
    const result = await deleteWebhook("wh-1");
    expect(result.success).toBe(false);
    expect(mockPrismaWebhookDelete).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────
// Caminho único e updateWebhook
// ──────────────────────────────────────────────

describe("createWebhook, caminho único", () => {
  it("bloqueia webhook de entrada com caminho duplicado", async () => {
    mockPrismaWebhookFindFirst.mockResolvedValue({ id: "wh-existente" });
    const result = await createWebhook({
      direction: "inbound",
      name: "Outro",
      path: "whatsapp/inbound",
      methods: ["POST"],
    });
    expect(result.success).toBe(false);
    expect(mockPrismaWebhookCreate).not.toHaveBeenCalled();
  });
});

describe("updateWebhook", () => {
  it("atualiza nome e métodos de um webhook de entrada", async () => {
    const result = await updateWebhook("wh-1", {
      name: "Receptor renomeado",
      path: "whatsapp/inbound",
      methods: ["POST", "HEAD"],
    });
    expect(result.success).toBe(true);
    expect(mockPrismaWebhookUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "wh-1" } }),
    );
  });

  it("bloqueia troca de caminho para um já existente", async () => {
    mockPrismaWebhookFindFirst.mockResolvedValue({ id: "wh-outro" });
    const result = await updateWebhook("wh-1", {
      name: "Receptor",
      path: "ja-existe",
      methods: ["POST"],
    });
    expect(result.success).toBe(false);
    expect(mockPrismaWebhookUpdate).not.toHaveBeenCalled();
  });

  it("retorna erro para usuário sem permissão", async () => {
    mockGetCurrentUser.mockResolvedValue(REGULAR_USER);
    const result = await updateWebhook("wh-1", {
      name: "X",
      path: "x",
      methods: ["POST"],
    });
    expect(result.success).toBe(false);
    expect(mockPrismaWebhookUpdate).not.toHaveBeenCalled();
  });

  it("grava events ao atualizar um outbound (F5 D)", async () => {
    mockPrismaWebhookFindUnique.mockResolvedValue({ id: "wh-2", direction: "outbound" });
    const result = await updateWebhook("wh-2", {
      name: "Callback n8n",
      targetUrl: "https://n8n.example.com/webhook/xyz",
      methods: ["POST"],
      events: ["agent_reply"],
    });
    expect(result.success).toBe(true);
    expect(mockPrismaWebhookUpdate.mock.calls[0][0].data.events).toEqual([
      "agent_reply",
    ]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Gate do receptor de WhatsApp (decisão do usuário, 2026-07-09)
//
// O tipo "Receber mensagens do WhatsApp" é exclusivo do super_admin. Os outros
// dois tipos ficam para quem enxerga o menu Integrações. A tela esconde o card,
// mas a proteção que vale é esta: a ação recusa no servidor.
// ──────────────────────────────────────────────────────────────────────────────
describe("gate do receptor de WhatsApp", () => {
  /** Menu Integrações liberado para admin. */
  function menuLiberadoParaAdmin() {
    mockPrismaMenuAccessFindMany.mockResolvedValue([
      { menuKey: "integracoes", accessLevel: "admin" },
    ] as never);
  }

  const WHATSAPP_INPUT = {
    direction: "inbound" as const,
    name: "Receptor WhatsApp",
    path: "whatsapp/loja",
    methods: ["POST" as const],
    isWhatsappReceiver: true,
    businessId: "553499999999",
  };

  it("admin com o menu liberado CRIA webhook comum", async () => {
    menuLiberadoParaAdmin();
    mockGetCurrentUser.mockResolvedValue(REGULAR_USER);
    const r = await createWebhook(INBOUND_INPUT);
    expect(r.success).toBe(true);
  });

  it("admin com o menu liberado NAO cria o receptor de WhatsApp", async () => {
    menuLiberadoParaAdmin();
    mockGetCurrentUser.mockResolvedValue(REGULAR_USER);
    const r = await createWebhook(WHATSAPP_INPUT);
    expect(r).toEqual({ success: false, error: "Acesso negado" });
    expect(mockPrismaWebhookCreate).not.toHaveBeenCalled();
  });

  it("super_admin cria o receptor de WhatsApp", async () => {
    menuLiberadoParaAdmin();
    mockGetCurrentUser.mockResolvedValue(SUPER_ADMIN);
    const r = await createWebhook(WHATSAPP_INPUT);
    expect(r.success).toBe(true);
  });

  it("admin NAO edita um webhook que ja e receptor de WhatsApp", async () => {
    menuLiberadoParaAdmin();
    mockGetCurrentUser.mockResolvedValue(REGULAR_USER);
    mockPrismaWebhookFindUnique.mockResolvedValue({
      id: "wh-1",
      direction: "inbound",
      isWhatsappReceiver: true,
    });
    const r = await updateWebhook("wh-1", {
      name: "sequestrado",
      path: "outro/caminho",
      methods: ["POST"],
    });
    expect(r).toEqual({ success: false, error: "Acesso negado" });
    expect(mockPrismaWebhookUpdate).not.toHaveBeenCalled();
  });

  it("admin nao ve o receptor de WhatsApp na listagem", async () => {
    menuLiberadoParaAdmin();
    mockGetCurrentUser.mockResolvedValue(REGULAR_USER);
    await listWebhooks();
    const where = mockPrismaWebhookFindMany.mock.calls[0][0]?.where;
    expect(where).toEqual({ isWhatsappReceiver: false });
  });

  it("super_admin ve todos os webhooks na listagem", async () => {
    mockGetCurrentUser.mockResolvedValue(SUPER_ADMIN);
    await listWebhooks();
    const where = mockPrismaWebhookFindMany.mock.calls[0][0]?.where;
    expect(where).toBeUndefined();
  });
});
