// mcp/auth/__tests__/auth-middleware.test.ts
import { authenticate } from "../auth-middleware";
import { createApiKeyCache } from "../api-key-cache";
import { mockPrisma } from "../../__tests__/mocks/prisma";
import type { ApiKeyContext } from "../api-key-context";

const SERVICE_TOKEN = "test-service-token-abc";

const validApiKeyCtx: ApiKeyContext = {
  apiKeyId: "ext-key-1",
  label: "external",
  last4: "1234",
  capabilities: { version: 1, read: ["estoque.*"], write: {} },
  capabilitiesVersion: 1,
  rateLimit: 60,
  tenantId: null,
  allowedOrigins: [],
  isSystemKey: false,
};

describe("authenticate", () => {
  beforeEach(() => {
    process.env.MCP_SERVICE_TOKEN = SERVICE_TOKEN;
  });

  afterEach(() => {
    delete process.env.MCP_SERVICE_TOKEN;
  });

  describe("D6: discriminação Bearer interno vs externo", () => {
    it("retorna internal quando token = MCP_SERVICE_TOKEN e userId presente", async () => {
      const prisma = mockPrisma();
      const cache = createApiKeyCache();

      const result = await authenticate(prisma as any, cache, {
        headerAuth: `Bearer ${SERVICE_TOKEN}`,
        headerUserId: "user-123",
      });

      expect(result).toEqual({ mode: "internal", userId: "user-123" });
    });

    it("retorna external para token de ApiKey válida", async () => {
      const prisma = mockPrisma({
        apiKey: {
          findUnique: jest.fn().mockResolvedValue({
            id: "ext-key-1",
            label: "external",
            keyHash: "willbehashed",
            last4: "1234",
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
          }),
        },
      });
      const cache = createApiKeyCache();

      const result = await authenticate(prisma as any, cache, {
        headerAuth: "Bearer external-api-token-xyz",
        headerUserId: undefined,
      });

      expect(result.mode).toBe("external");
      if (result.mode === "external") {
        expect(result.apiKey.apiKeyId).toBe("ext-key-1");
      }
    });

    it("retorna invalid_token quando header ausente", async () => {
      const cache = createApiKeyCache();
      const result = await authenticate(mockPrisma() as any, cache, {
        headerAuth: undefined,
        headerUserId: undefined,
      });
      expect(result).toEqual({ mode: "unauthorized", reason: "invalid_token" });
    });

    it("retorna invalid_token quando header não começa com Bearer", async () => {
      const cache = createApiKeyCache();
      const result = await authenticate(mockPrisma() as any, cache, {
        headerAuth: "Basic sometoken",
        headerUserId: undefined,
      });
      expect(result).toEqual({ mode: "unauthorized", reason: "invalid_token" });
    });

    it("retorna invalid_token quando ApiKey não encontrada", async () => {
      const prisma = mockPrisma({
        apiKey: { findUnique: jest.fn().mockResolvedValue(null) },
      });
      const cache = createApiKeyCache();

      const result = await authenticate(prisma as any, cache, {
        headerAuth: "Bearer unknown-token",
        headerUserId: undefined,
      });

      expect(result).toEqual({ mode: "unauthorized", reason: "invalid_token" });
    });
  });

  describe("D7: token em local inseguro", () => {
    it("recusa quando token está na URL como query param", async () => {
      const cache = createApiKeyCache();
      const result = await authenticate(mockPrisma() as any, cache, {
        headerAuth: `Bearer ${SERVICE_TOKEN}`,
        headerUserId: "user-1",
        requestUrl: "https://api.example.com/mcp?token=secret",
      });
      expect(result).toEqual({ mode: "unauthorized", reason: "token_in_unsafe_location" });
    });

    it("recusa quando body contém campo 'token'", async () => {
      const cache = createApiKeyCache();
      const result = await authenticate(mockPrisma() as any, cache, {
        headerAuth: `Bearer ${SERVICE_TOKEN}`,
        headerUserId: "user-1",
        bodyKeys: ["message", "token"],
      });
      expect(result).toEqual({ mode: "unauthorized", reason: "token_in_unsafe_location" });
    });

    it("recusa quando body contém campo 'authorization'", async () => {
      const cache = createApiKeyCache();
      const result = await authenticate(mockPrisma() as any, cache, {
        headerAuth: `Bearer ${SERVICE_TOKEN}`,
        headerUserId: "user-1",
        bodyKeys: ["authorization"],
      });
      expect(result).toEqual({ mode: "unauthorized", reason: "token_in_unsafe_location" });
    });
  });

  describe("D8: mascaramento de token em logs , sem vazar token bruto", () => {
    it("não expõe token bruto na resposta (modo unauthorized)", async () => {
      const cache = createApiKeyCache();
      const result = await authenticate(mockPrisma() as any, cache, {
        headerAuth: "Bearer super-secret-raw-token",
        headerUserId: undefined,
      });
      // Resultado não deve conter o token bruto
      expect(JSON.stringify(result)).not.toContain("super-secret-raw-token");
    });
  });

  describe("missing_user_id", () => {
    it("retorna missing_user_id quando service token sem X-User-Id", async () => {
      const cache = createApiKeyCache();
      const result = await authenticate(mockPrisma() as any, cache, {
        headerAuth: `Bearer ${SERVICE_TOKEN}`,
        headerUserId: undefined,
      });
      expect(result).toEqual({ mode: "unauthorized", reason: "missing_user_id" });
    });

    it("retorna missing_user_id quando X-User-Id é string vazia", async () => {
      const cache = createApiKeyCache();
      const result = await authenticate(mockPrisma() as any, cache, {
        headerAuth: `Bearer ${SERVICE_TOKEN}`,
        headerUserId: "   ",
      });
      expect(result).toEqual({ mode: "unauthorized", reason: "missing_user_id" });
    });
  });
});
