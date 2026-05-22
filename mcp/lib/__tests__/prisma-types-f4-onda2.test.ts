// mcp/lib/__tests__/prisma-types-f4-onda2.test.ts
// Verifica que os tipos Prisma gerados pela migration f4_onda2_mcp_writes
// expõem os campos novos do modelo ApiKey, McpAuditLog e McpIdempotencyRecord.

import { describe, it, expect } from "@jest/globals";
import type {
  ApiKey,
  McpAuditLog,
  McpIdempotencyRecord,
} from "@/generated/prisma/client";

describe("F4 Onda 2 — tipos Prisma após migration", () => {
  it("ApiKey expõe campos novos da Onda 2", () => {
    // Compile-time check: o type tem que aceitar todos esses campos.
    const k: Partial<ApiKey> = {
      description: "desc",
      capabilities: { version: 1, read: [], write: {} } as unknown as ApiKey["capabilities"],
      capabilitiesVersion: 1,
      rateLimit: 60,
      active: true,
      expiresAt: null,
      lastUsedAt: null,
      rotatedAt: null,
      revokedReason: null,
      isSystemKey: false,
      tenantId: null,
      allowedOrigins: [] as unknown as ApiKey["allowedOrigins"],
    };
    expect(k.rateLimit).toBe(60);
    expect(k.active).toBe(true);
  });

  it("ApiKey preserva campos legados", () => {
    const k: Partial<ApiKey> = {
      id: "u",
      label: "test",
      keyHash: "h",
      last4: "AbCd",
      scopes: [] as unknown as ApiKey["scopes"],
      revokedAt: null,
      createdById: null,
      createdAt: new Date(),
    };
    expect(k.label).toBe("test");
  });

  it("McpAuditLog expõe campos novos da Onda 2", () => {
    const a: Partial<McpAuditLog> = {
      apiKeyId: null,
      authMode: "external",
      operation: "write",
      module: "crm",
      action: "create",
      capability: "create:crm",
      eventName: "crm.res_partner.created",
      requestId: "req-1",
      idempotencyKey: "uuid",
      payload: { name: "X" } as unknown as McpAuditLog["payload"],
      result: null,
      snapshotBefore: null,
      snapshotAfter: null,
      status: "success",
      httpStatus: 200,
      errorCode: null,
      errorMessage: null,
      ipAddress: "127.0.0.1",
      userAgent: "n8n",
    };
    expect(a.authMode).toBe("external");
    expect(a.status).toBe("success");
  });

  it("McpAuditLog preserva campos legados", () => {
    const a: Partial<McpAuditLog> = {
      id: "u",
      userId: "user-1",
      tool: "crm.res_partner.create",
      params: { id: 1 } as unknown as McpAuditLog["params"],
      outcome: "ok",
      rowCount: 1,
      durationMs: 42,
    };
    expect(a.outcome).toBe("ok");
  });

  it("McpIdempotencyRecord existe com PK composto", () => {
    const r: Partial<McpIdempotencyRecord> = {
      apiKeyId: "u",
      key: "uuid-1",
      toolId: "crm.res_partner.create",
      payloadHash: "sha-256",
      result: { id: 1 } as unknown as McpIdempotencyRecord["result"],
      status: "success",
      httpStatus: 200,
      expiresAt: new Date(),
      createdAt: new Date(),
    };
    expect(r.key).toBe("uuid-1");
  });
});
