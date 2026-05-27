/* eslint-disable @typescript-eslint/no-explicit-any */
// mcp/auth/__tests__/api-key-lookup.test.ts
import { lookupApiKey, lookupApiKeyWithReason } from "../api-key-lookup";
import { mockPrisma } from "../../__tests__/mocks/prisma";

// Row base válido que simula o que o Prisma retornaria
const validRow = {
  id: "key-id-1",
  label: "test key",
  keyHash: "abc123hash",
  last4: "AbCd",
  scopes: [],
  revokedAt: null,
  createdById: null,
  createdAt: new Date(),
  description: null,
  capabilities: { version: 1, read: ["estoque.*"], write: {} },
  capabilitiesVersion: 1,
  rateLimit: 60,
  active: true,
  expiresAt: null,
  lastUsedAt: null,
  rotatedAt: null,
  revokedReason: null,
  isSystemKey: false,
  tenantId: null,
  allowedOrigins: [],
};

describe("lookupApiKey", () => {
  it("retorna ApiKeyContext para key válida", async () => {
    const prisma = mockPrisma({
      apiKey: { findUnique: jest.fn().mockResolvedValue(validRow) },
    });
    const result = await lookupApiKey(prisma as any, "abc123hash");
    expect(result).not.toBeNull();
    expect(result?.apiKeyId).toBe("key-id-1");
    expect(result?.rateLimit).toBe(60);
  });

  it("retorna null se key não encontrada", async () => {
    const prisma = mockPrisma({
      apiKey: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    const result = await lookupApiKey(prisma as any, "nonexistent");
    expect(result).toBeNull();
  });

  it("retorna null se key revogada", async () => {
    const prisma = mockPrisma({
      apiKey: { findUnique: jest.fn().mockResolvedValue({ ...validRow, revokedAt: new Date() }) },
    });
    const result = await lookupApiKey(prisma as any, "abc123hash");
    expect(result).toBeNull();
  });

  it("retorna null se key expirada", async () => {
    const past = new Date(Date.now() - 1000 * 60 * 60); // 1h atrás
    const prisma = mockPrisma({
      apiKey: { findUnique: jest.fn().mockResolvedValue({ ...validRow, expiresAt: past }) },
    });
    const result = await lookupApiKey(prisma as any, "abc123hash");
    expect(result).toBeNull();
  });

  it("retorna ApiKeyContext se expiresAt é no futuro", async () => {
    const future = new Date(Date.now() + 1000 * 60 * 60); // 1h à frente
    const prisma = mockPrisma({
      apiKey: { findUnique: jest.fn().mockResolvedValue({ ...validRow, expiresAt: future }) },
    });
    const result = await lookupApiKey(prisma as any, "abc123hash");
    expect(result).not.toBeNull();
  });

  it("retorna null se key inativa", async () => {
    const prisma = mockPrisma({
      apiKey: { findUnique: jest.fn().mockResolvedValue({ ...validRow, active: false }) },
    });
    const result = await lookupApiKey(prisma as any, "abc123hash");
    expect(result).toBeNull();
  });
});

describe("lookupApiKeyWithReason", () => {
  it("retorna ok:true para key válida", async () => {
    const prisma = mockPrisma({
      apiKey: { findUnique: jest.fn().mockResolvedValue(validRow) },
    });
    const result = await lookupApiKeyWithReason(prisma as any, "abc123hash");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.context.apiKeyId).toBe("key-id-1");
  });

  it("retorna not_found", async () => {
    const prisma = mockPrisma({
      apiKey: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    const result = await lookupApiKeyWithReason(prisma as any, "x");
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("retorna revoked antes de verificar inactive", async () => {
    const prisma = mockPrisma({
      apiKey: {
        findUnique: jest.fn().mockResolvedValue({ ...validRow, revokedAt: new Date(), active: false }),
      },
    });
    const result = await lookupApiKeyWithReason(prisma as any, "x");
    expect(result).toEqual({ ok: false, reason: "revoked" });
  });

  it("retorna expired", async () => {
    const past = new Date(Date.now() - 5000);
    const prisma = mockPrisma({
      apiKey: { findUnique: jest.fn().mockResolvedValue({ ...validRow, expiresAt: past }) },
    });
    const result = await lookupApiKeyWithReason(prisma as any, "x");
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("retorna inactive", async () => {
    const prisma = mockPrisma({
      apiKey: { findUnique: jest.fn().mockResolvedValue({ ...validRow, active: false }) },
    });
    const result = await lookupApiKeyWithReason(prisma as any, "x");
    expect(result).toEqual({ ok: false, reason: "inactive" });
  });
});