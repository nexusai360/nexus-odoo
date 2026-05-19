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
jest.mock("@/lib/prisma", () => ({
  prisma: {
    whatsappWebhook: {
      findMany: mockPrismaWebhookFindMany,
      create: mockPrismaWebhookCreate,
      update: mockPrismaWebhookUpdate,
      delete: mockPrismaWebhookDelete,
    },
  },
}));

// ──────────────────────────────────────────────
// Import após mocks
// ──────────────────────────────────────────────

import {
  createWebhook,
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
