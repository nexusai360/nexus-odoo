// mcp/__tests__/fixtures/__tests__/contexts.test.ts
// Testes das factories de contexto usadas nos testes dos blocos B,J do F4 Onda 2.

import {
  baseApiKeyContext,
  createApiKeyCtx,
  createMockContext,
} from "../contexts";

describe("baseApiKeyContext", () => {
  it("tem todos os campos esperados com valores padrão", () => {
    expect(baseApiKeyContext.apiKeyId).toBe("test-key-1");
    expect(baseApiKeyContext.label).toBe("test");
    expect(baseApiKeyContext.last4).toBe("AbCd");
    expect(baseApiKeyContext.capabilities).toEqual({
      version: 1,
      read: [],
      write: {},
    });
    expect(baseApiKeyContext.capabilitiesVersion).toBe(1);
    expect(baseApiKeyContext.rateLimit).toBe(60);
    expect(baseApiKeyContext.tenantId).toBeNull();
    expect(baseApiKeyContext.allowedOrigins).toEqual([]);
    expect(baseApiKeyContext.isSystemKey).toBe(false);
  });
});

describe("createApiKeyCtx", () => {
  it("retorna baseApiKeyContext quando chamado sem overrides", () => {
    const ctx = createApiKeyCtx();
    expect(ctx).toEqual(baseApiKeyContext);
  });

  it("popula read quando fornecido", () => {
    const ctx = createApiKeyCtx({ read: ["crm", "estoque"] });
    expect(ctx.capabilities.read).toEqual(["crm", "estoque"]);
    expect(ctx.capabilities.write).toEqual({});
  });

  it("popula write quando fornecido", () => {
    const ctx = createApiKeyCtx({ write: { estoque: ["criar_produto"] } });
    expect(ctx.capabilities.write).toEqual({ estoque: ["criar_produto"] });
    expect(ctx.capabilities.read).toEqual([]);
  });

  it("aplica capabilitiesVersion override", () => {
    const ctx = createApiKeyCtx({ capabilitiesVersion: 3 });
    expect(ctx.capabilitiesVersion).toBe(3);
  });

  it("aplica tenantId override", () => {
    const ctx = createApiKeyCtx({ tenantId: "tenant-42" });
    expect(ctx.tenantId).toBe("tenant-42");
  });

  it("aplica isSystemKey override", () => {
    const ctx = createApiKeyCtx({ isSystemKey: true });
    expect(ctx.isSystemKey).toBe(true);
  });

  it("capabilities sempre tem version: 1", () => {
    const ctx = createApiKeyCtx({ read: ["financeiro"] });
    expect(ctx.capabilities.version).toBe(1);
  });
});

describe("createMockContext", () => {
  it("retorna ctx com prisma mock e user super_admin por padrão", () => {
    const ctx = createMockContext();
    expect(ctx.prisma).toBeDefined();
    expect(ctx.user.userId).toBe("test-user");
    expect(ctx.user.role).toBe("super_admin");
    expect(ctx.user.domains).toEqual([]);
  });

  it("aplica overrides de user", () => {
    const ctx = createMockContext({
      user: { userId: "admin-1", role: "admin", domains: [] } as any,
    });
    expect(ctx.user.userId).toBe("admin-1");
    expect(ctx.user.role).toBe("admin");
  });

  it("prisma mock expõe métodos jest.fn()", () => {
    const ctx = createMockContext();
    expect(typeof ctx.prisma.apiKey.findUnique).toBe("function");
    expect(typeof ctx.prisma.mcpAuditLog.create).toBe("function");
  });
});
