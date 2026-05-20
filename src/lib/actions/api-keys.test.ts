/**
 * Testes das Server Actions de API keys.
 * TDD: testes escritos antes da implementação.
 * Gate: super_admin.
 * Hash SHA-256: key exibida 1× na criação, persiste-se apenas keyHash + last4.
 */

// ──────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────

const mockGetCurrentUser = jest.fn();
const mockPrismaApiKeyFindMany = jest.fn();
const mockPrismaApiKeyCreate = jest.fn();
const mockPrismaApiKeyUpdate = jest.fn();
const mockLogAudit = jest.fn();
const mockRevalidatePath = jest.fn();

jest.mock("@/lib/auth", () => ({ getCurrentUser: mockGetCurrentUser }));
jest.mock("@/lib/audit", () => ({ logAudit: mockLogAudit }));
jest.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      findMany: mockPrismaApiKeyFindMany,
      create: mockPrismaApiKeyCreate,
      update: mockPrismaApiKeyUpdate,
    },
  },
}));

// ──────────────────────────────────────────────
// Import após mocks
// ──────────────────────────────────────────────

import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from "./api-keys";

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
  platformRole: "manager",
  isActive: true,
};

const EXISTING_KEYS = [
  {
    id: "key-1",
    label: "n8n production",
    keyHash: "abc123hash",
    last4: "1234",
    scopes: ["agent:query"],
    revokedAt: null,
    createdById: "user-sa",
    createdAt: new Date("2026-05-01"),
  },
  {
    id: "key-2",
    label: "test key",
    keyHash: "def456hash",
    last4: "5678",
    scopes: [],
    revokedAt: new Date("2026-05-10"),
    createdById: "user-sa",
    createdAt: new Date("2026-05-05"),
  },
];

// ──────────────────────────────────────────────
// Setup
// ──────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(SUPER_ADMIN);
  mockPrismaApiKeyFindMany.mockResolvedValue(EXISTING_KEYS);
  mockPrismaApiKeyCreate.mockResolvedValue({
    id: "key-new",
    label: "nova key",
    keyHash: "newhash",
    last4: "abcd",
    scopes: ["agent:query"],
    revokedAt: null,
    createdById: "user-sa",
    createdAt: new Date(),
  });
  mockPrismaApiKeyUpdate.mockResolvedValue({});
});

// ──────────────────────────────────────────────
// createApiKey
// ──────────────────────────────────────────────

describe("createApiKey", () => {
  it("cria uma API key e retorna a key em claro uma vez", async () => {
    const result = await createApiKey("n8n prod", ["agent:query"]);
    expect(result.success).toBe(true);
    if (result.success) {
      // A key em claro deve existir e ter formato reconhecível
      expect(result.data.key).toBeDefined();
      expect(typeof result.data.key).toBe("string");
      expect(result.data.key.length).toBeGreaterThan(16);
      // last4 deve ser os últimos 4 caracteres da key
      expect(result.data.last4).toBe(result.data.key.slice(-4));
    }
  });

  it("persiste apenas o hash (não a key em claro)", async () => {
    const result = await createApiKey("test", []);
    expect(result.success).toBe(true);
    // O prisma.create não deve ser chamado com a key em claro
    const createCall = mockPrismaApiKeyCreate.mock.calls[0][0];
    expect(createCall.data).not.toHaveProperty("key");
    // Mas deve ter keyHash e last4
    expect(createCall.data).toHaveProperty("keyHash");
    expect(createCall.data).toHaveProperty("last4");
  });

  it("o keyHash é SHA-256 da key em claro", async () => {
    const result = await createApiKey("hash-test", []);
    expect(result.success).toBe(true);
    const createCall = mockPrismaApiKeyCreate.mock.calls[0][0];
    // keyHash deve ser uma string hexadecimal de 64 chars (SHA-256)
    expect(createCall.data.keyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("audita api_key_created", async () => {
    await createApiKey("audit-test", ["agent:query"]);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "api_key_created" }),
    );
  });

  it("retorna erro para usuário sem permissão", async () => {
    mockGetCurrentUser.mockResolvedValue(REGULAR_USER);
    const result = await createApiKey("blocked", []);
    expect(result.success).toBe(false);
    expect(mockPrismaApiKeyCreate).not.toHaveBeenCalled();
  });

  it("retorna erro quando não autenticado", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const result = await createApiKey("unauth", []);
    expect(result.success).toBe(false);
  });

  it("valida label vazio", async () => {
    const result = await createApiKey("", []);
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// listApiKeys
// ──────────────────────────────────────────────

describe("listApiKeys", () => {
  it("retorna a lista de API keys para super_admin", async () => {
    const result = await listApiKeys();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe("key-1");
      expect(result.data[0].label).toBe("n8n production");
    }
  });

  it("retorna erro para usuário sem permissão", async () => {
    mockGetCurrentUser.mockResolvedValue(REGULAR_USER);
    const result = await listApiKeys();
    expect(result.success).toBe(false);
  });

  it("retorna erro quando não autenticado", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const result = await listApiKeys();
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// revokeApiKey
// ──────────────────────────────────────────────

describe("revokeApiKey", () => {
  it("revoga uma API key existente", async () => {
    const result = await revokeApiKey("key-1");
    expect(result.success).toBe(true);
    expect(mockPrismaApiKeyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "key-1" },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
  });

  it("audita api_key_revoked", async () => {
    await revokeApiKey("key-1");
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "api_key_revoked" }),
    );
  });

  it("retorna erro para usuário sem permissão", async () => {
    mockGetCurrentUser.mockResolvedValue(REGULAR_USER);
    const result = await revokeApiKey("key-1");
    expect(result.success).toBe(false);
    expect(mockPrismaApiKeyUpdate).not.toHaveBeenCalled();
  });

  it("retorna erro quando não autenticado", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const result = await revokeApiKey("key-1");
    expect(result.success).toBe(false);
  });
});
