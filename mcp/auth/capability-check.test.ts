// mcp/auth/capability-check.test.ts
// TDD para hasCapability (Bloco F , F3).
import { hasCapability, type CapabilityCheck } from "./capability-check.js";
import type { ApiKeyContext } from "./api-key-context.js";

function makeCtx(overrides: Partial<ApiKeyContext> = {}): ApiKeyContext {
  return {
    apiKeyId: "key-1",
    label: "test",
    last4: "abcd",
    capabilities: {
      version: 5,
      read: ["estoque", "financeiro"],
      write: {
        estoque: ["update_quantity"],
        comercial: ["create_order", "cancel_order"],
      },
    },
    capabilitiesVersion: 5,
    rateLimit: 60,
    tenantId: null,
    allowedOrigins: [],
    isSystemKey: false,
    ...overrides,
  };
}

describe("hasCapability , read", () => {
  it("retorna true para módulo na lista de read", () => {
    const ctx = makeCtx();
    expect(hasCapability(ctx, { type: "read", module: "estoque" })).toBe(true);
  });

  it("retorna false para módulo ausente na lista de read", () => {
    const ctx = makeCtx();
    expect(hasCapability(ctx, { type: "read", module: "fiscal" })).toBe(false);
  });

  it("retorna true para múltiplos módulos no read", () => {
    const ctx = makeCtx();
    expect(hasCapability(ctx, { type: "read", module: "financeiro" })).toBe(true);
  });
});

describe("hasCapability , write", () => {
  it("retorna true para ação permitida no módulo", () => {
    const ctx = makeCtx();
    expect(
      hasCapability(ctx, { type: "write", module: "comercial", action: "create_order" }),
    ).toBe(true);
  });

  it("retorna false para ação não permitida no módulo", () => {
    const ctx = makeCtx();
    expect(
      hasCapability(ctx, { type: "write", module: "comercial", action: "delete_order" }),
    ).toBe(false);
  });

  it("retorna false para módulo não presente em write", () => {
    const ctx = makeCtx();
    expect(
      hasCapability(ctx, { type: "write", module: "fiscal", action: "create_nota" }),
    ).toBe(false);
  });

  it("retorna true para segunda ação do mesmo módulo", () => {
    const ctx = makeCtx();
    expect(
      hasCapability(ctx, { type: "write", module: "comercial", action: "cancel_order" }),
    ).toBe(true);
  });
});

describe("hasCapability , addedInVersion gate", () => {
  it("retorna false se addedInVersion > capabilitiesVersion", () => {
    const ctx = makeCtx({ capabilitiesVersion: 3 });
    expect(
      hasCapability(
        ctx,
        { type: "read", module: "estoque" },
        { addedInVersion: 5 },
      ),
    ).toBe(false);
  });

  it("retorna true se addedInVersion === capabilitiesVersion", () => {
    const ctx = makeCtx({ capabilitiesVersion: 5 });
    expect(
      hasCapability(
        ctx,
        { type: "read", module: "estoque" },
        { addedInVersion: 5 },
      ),
    ).toBe(true);
  });

  it("retorna true se addedInVersion < capabilitiesVersion", () => {
    const ctx = makeCtx({ capabilitiesVersion: 7 });
    expect(
      hasCapability(
        ctx,
        { type: "read", module: "estoque" },
        { addedInVersion: 3 },
      ),
    ).toBe(true);
  });

  it("retorna true se addedInVersion ausente (sem opts)", () => {
    const ctx = makeCtx({ capabilitiesVersion: 1 });
    expect(hasCapability(ctx, { type: "read", module: "estoque" })).toBe(true);
  });

  it("gate de versão aplica também a write", () => {
    const ctx = makeCtx({ capabilitiesVersion: 2 });
    expect(
      hasCapability(
        ctx,
        { type: "write", module: "comercial", action: "create_order" },
        { addedInVersion: 4 },
      ),
    ).toBe(false);
  });
});
