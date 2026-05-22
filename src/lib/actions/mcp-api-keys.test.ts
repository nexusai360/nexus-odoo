/**
 * Testes das Server Actions de chaves de acesso MCP.
 * Gate: super_admin.
 * Token: mcp_live_<32 bytes base64url>
 * keyHash = sha256hex(token), last4 = token.slice(-4)
 */

// ──────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────

const mockRequireSuperAdmin = jest.fn();
const mockPrismaApiKeyFindMany = jest.fn();
const mockPrismaApiKeyCreate = jest.fn();
const mockPrismaApiKeyUpdate = jest.fn();
const mockPrismaApiKeyFindUniqueOrThrow = jest.fn();
const mockLogAudit = jest.fn();
const mockRevalidatePath = jest.fn();
const mockRedisPublish = jest.fn();

jest.mock("@/lib/actions/_helpers", () => ({
  requireSuperAdmin: mockRequireSuperAdmin,
}));

jest.mock("@/lib/audit", () => ({ logAudit: mockLogAudit }));
jest.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
jest.mock("@/lib/redis", () => ({ redis: { publish: mockRedisPublish } }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      findMany: mockPrismaApiKeyFindMany,
      create: mockPrismaApiKeyCreate,
      update: mockPrismaApiKeyUpdate,
      findUniqueOrThrow: mockPrismaApiKeyFindUniqueOrThrow,
    },
  },
}));

// ──────────────────────────────────────────────
// Import após mocks
// ──────────────────────────────────────────────

import {
  listMcpApiKeys,
  createMcpApiKey,
  updateMcpApiKey,
  rotateMcpApiKey,
  revokeMcpApiKey,
  markLostAndRegenerate,
} from "./mcp-api-keys";
import type { McpCapabilities } from "./mcp-api-keys-types";

// ──────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────

const SUPER_ADMIN = { id: "user-sa", platformRole: "super_admin" };

const BASE_CAPABILITIES = { version: 1 as const, read: ["estoque" as const], write: {} };

const EXISTING_KEY = {
  id: "key-1",
  label: "n8n produção",
  description: null,
  keyHash: "abc123hash",
  last4: "1234",
  scopes: [],
  capabilities: { version: 1, read: ["estoque"], write: {} },
  rateLimit: 60,
  active: true,
  expiresAt: null,
  lastUsedAt: null,
  revokedAt: null,
  rotatedAt: null,
  isSystemKey: false,
  tenantId: null,
  allowedOrigins: [],
  createdAt: new Date("2026-05-01"),
};

// ──────────────────────────────────────────────
// Setup
// ──────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireSuperAdmin.mockResolvedValue(SUPER_ADMIN);
  mockPrismaApiKeyFindMany.mockResolvedValue([EXISTING_KEY]);
  mockPrismaApiKeyCreate.mockResolvedValue({ ...EXISTING_KEY, id: "key-new", label: "nova", last4: "abcd" });
  mockPrismaApiKeyUpdate.mockResolvedValue({ ...EXISTING_KEY, label: "atualizada" });
  mockPrismaApiKeyFindUniqueOrThrow.mockResolvedValue(EXISTING_KEY);
  mockRedisPublish.mockResolvedValue(1);
  mockLogAudit.mockResolvedValue(undefined);
});

// ──────────────────────────────────────────────
// listMcpApiKeys
// ──────────────────────────────────────────────

describe("listMcpApiKeys", () => {
  it("retorna lista para super_admin", async () => {
    const result = await listMcpApiKeys();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe("key-1");
    }
  });

  it("retorna erro quando requireSuperAdmin falha", async () => {
    mockRequireSuperAdmin.mockRejectedValue(new Error("Acesso negado"));
    const result = await listMcpApiKeys();
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// createMcpApiKey
// ──────────────────────────────────────────────

describe("createMcpApiKey", () => {
  it("cria chave com prefixo mcp_live_", async () => {
    const result = await createMcpApiKey({
      label: "teste",
      capabilities: BASE_CAPABILITIES,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.token).toMatch(/^mcp_live_/);
    }
  });

  it("persiste apenas keyHash, nunca o token em claro", async () => {
    await createMcpApiKey({ label: "hash-test", capabilities: BASE_CAPABILITIES });
    const createCall = mockPrismaApiKeyCreate.mock.calls[0][0];
    expect(createCall.data).not.toHaveProperty("token");
    expect(createCall.data).toHaveProperty("keyHash");
    expect(createCall.data.keyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("last4 é os últimos 4 chars do token", async () => {
    const result = await createMcpApiKey({ label: "l4-test", capabilities: BASE_CAPABILITIES });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.token.slice(-4)).toBe(result.data.last4);
    }
  });

  it("audita api_key_created", async () => {
    await createMcpApiKey({ label: "audit", capabilities: BASE_CAPABILITIES });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "api_key_created" }),
    );
  });

  it("retorna erro se label vazio", async () => {
    const result = await createMcpApiKey({ label: "", capabilities: BASE_CAPABILITIES });
    expect(result.success).toBe(false);
    expect(mockPrismaApiKeyCreate).not.toHaveBeenCalled();
  });

  it("retorna erro quando requireSuperAdmin falha", async () => {
    mockRequireSuperAdmin.mockRejectedValue(new Error("Acesso negado"));
    const result = await createMcpApiKey({ label: "x", capabilities: BASE_CAPABILITIES });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// updateMcpApiKey
// ──────────────────────────────────────────────

describe("updateMcpApiKey", () => {
  it("atualiza chave existente", async () => {
    const result = await updateMcpApiKey("key-1", { label: "novo label" });
    expect(result.success).toBe(true);
    expect(mockPrismaApiKeyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "key-1" } }),
    );
  });

  it("publica evento no Redis", async () => {
    await updateMcpApiKey("key-1", { label: "x" });
    expect(mockRedisPublish).toHaveBeenCalledWith(
      "mcp:keys:invalidated:key-1",
      expect.any(String),
    );
  });

  it("retorna erro quando requireSuperAdmin falha", async () => {
    mockRequireSuperAdmin.mockRejectedValue(new Error("Acesso negado"));
    const result = await updateMcpApiKey("key-1", { label: "x" });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// rotateMcpApiKey
// ──────────────────────────────────────────────

describe("rotateMcpApiKey", () => {
  it("gera novo token mcp_live_", async () => {
    const result = await rotateMcpApiKey("key-1");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.token).toMatch(/^mcp_live_/);
    }
  });

  it("atualiza keyHash no banco", async () => {
    await rotateMcpApiKey("key-1");
    const call = mockPrismaApiKeyUpdate.mock.calls[0][0];
    expect(call.data).toHaveProperty("keyHash");
    expect(call.data.keyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("publica evento no Redis", async () => {
    await rotateMcpApiKey("key-1");
    expect(mockRedisPublish).toHaveBeenCalledWith(
      "mcp:keys:invalidated:key-1",
      expect.any(String),
    );
  });
});

// ──────────────────────────────────────────────
// revokeMcpApiKey
// ──────────────────────────────────────────────

describe("revokeMcpApiKey", () => {
  it("define revokedAt e active=false", async () => {
    const result = await revokeMcpApiKey("key-1");
    expect(result.success).toBe(true);
    expect(mockPrismaApiKeyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "key-1" },
        data: expect.objectContaining({ revokedAt: expect.any(Date), active: false }),
      }),
    );
  });

  it("grava reason quando fornecido", async () => {
    await revokeMcpApiKey("key-1", "comprometida");
    const call = mockPrismaApiKeyUpdate.mock.calls[0][0];
    expect(call.data.revokedReason).toBe("comprometida");
  });

  it("audita api_key_revoked", async () => {
    await revokeMcpApiKey("key-1");
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "api_key_revoked" }),
    );
  });

  it("publica evento no Redis", async () => {
    await revokeMcpApiKey("key-1");
    expect(mockRedisPublish).toHaveBeenCalledWith(
      "mcp:keys:invalidated:key-1",
      expect.any(String),
    );
  });
});

// ──────────────────────────────────────────────
// markLostAndRegenerate
// ──────────────────────────────────────────────

describe("markLostAndRegenerate", () => {
  it("revoga a chave original e cria substituta", async () => {
    const result = await markLostAndRegenerate("key-1");
    expect(result.success).toBe(true);
    // Deve ter atualizado (revogar original)
    expect(mockPrismaApiKeyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "key-1" },
        data: expect.objectContaining({ revokedReason: "perdida" }),
      }),
    );
    // E criado substituta
    expect(mockPrismaApiKeyCreate).toHaveBeenCalled();
  });

  it("retorna novo token mcp_live_", async () => {
    const result = await markLostAndRegenerate("key-1");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.token).toMatch(/^mcp_live_/);
    }
  });

  it("audita a criação da substituta", async () => {
    await markLostAndRegenerate("key-1");
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "api_key_created",
        details: expect.objectContaining({ replacedId: "key-1" }),
      }),
    );
  });
});
