// mcp/__tests__/e2e/denial-audit.test.ts
// Suíte E2E — política de payload em denials (spec §10.5).
//
// Valida que:
//   1. Denial por capability_missing → grava audit com payload redactado
//   2. Denial por unauthorized (token inválido) → NÃO grava payload (suppressPayload)
//   3. redactPayload funciona corretamente em campos sensíveis
//   4. Audit de denial tem status "denied" e httpStatus correto
//   5. recordExternalAudit não lança em caso de falha do Prisma (falha silenciosa)
//
// Roda sem Odoo real — Prisma e Redis mockados.

import { warnMissingEnv } from "./setup.js";
import { mockPrisma } from "../mocks/prisma.js";
import { createApiKeyCtx } from "../fixtures/contexts.js";
import {
  recordExternalAudit,
  redactPayload,
  type ExternalAuditFields,
} from "../../dispatcher/external-pipeline.js";

beforeAll(() => {
  warnMissingEnv();
});

describe("E2E denial-audit — política de payload §10.5", () => {
  // 1. Denial por capability: payload deve ser redactado (não suprimido)
  it("1. denial por capability — audit gravado com payload redactado", async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = mockPrisma({ mcpAuditLog: { createMany } });

    const fields: ExternalAuditFields = {
      apiKeyId: "key-001",
      toolId: "crm.res_partner.create",
      requestId: "req-001",
      input: { name: "Parceiro", password: "secret123", cnpj_cpf: "12.345.678/0001-99" },
      status: "denied",
      httpStatus: 403,
      durationMs: 10,
      operation: "write",
      module: "crm",
      action: "create",
      errorCode: "capability_missing",
    };

    await recordExternalAudit(prisma as any, fields);

    expect(createMany).toHaveBeenCalledTimes(1);
    const callData = createMany.mock.calls[0][0].data[0];

    // Payload deve existir (não suprimido)
    expect(callData.payload).not.toBeNull();
    // Senha redactada
    expect(callData.payload?.password).toBe("[REDACTED]");
    // Campo não-sensível preservado
    expect(callData.payload?.name).toBe("Parceiro");
    // Status correto
    expect(callData.status).toBe("denied");
    expect(callData.httpStatus).toBe(403);
    expect(callData.outcome).toBe("denied");
  });

  // 2. Denial por token inválido: suppressPayload=true → payload NÃO gravado
  it("2. unauthorized — suppressPayload=true → payload nulo no audit", async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = mockPrisma({ mcpAuditLog: { createMany } });

    const fields: ExternalAuditFields = {
      apiKeyId: "unknown",
      toolId: "crm.res_partner.create",
      requestId: "req-002",
      input: { name: "Parceiro", token: "leaked-token" },
      status: "denied",
      httpStatus: 401,
      durationMs: 5,
      operation: "write",
      suppressPayload: true,
    };

    await recordExternalAudit(prisma as any, fields);

    expect(createMany).toHaveBeenCalledTimes(1);
    const callData = createMany.mock.calls[0][0].data[0];

    // Payload suprimido
    expect(callData.payload).toBeNull();
    // params (campo legado NOT NULL) deve ser {} quando suprimido
    expect(callData.params).toEqual({});
  });

  // 3. redactPayload: campos sensíveis substituídos por [REDACTED]
  it("3. redactPayload — campos sensíveis substituídos", () => {
    const input = {
      name: "Test",
      cpf: "123.456.789-00",
      cnpj: "12.345.678/0001-99",
      password: "secret",
      token: "bearer-token",
      secret: "mysecret",
      email: "test@example.com", // não sensível
    };

    const result = redactPayload(input) as Record<string, unknown>;

    expect(result["cpf"]).toBe("[REDACTED]");
    expect(result["cnpj"]).toBe("[REDACTED]");
    expect(result["password"]).toBe("[REDACTED]");
    expect(result["token"]).toBe("[REDACTED]");
    expect(result["secret"]).toBe("[REDACTED]");
    expect(result["name"]).toBe("Test");
    expect(result["email"]).toBe("test@example.com");
  });

  // 4. redactPayload: arrays preservados, primitivos retornados sem alteração
  it("4. redactPayload — arrays e primitivos passam sem alteração", () => {
    expect(redactPayload(["a", "b"])).toEqual(["a", "b"]);
    expect(redactPayload("string")).toBe("string");
    expect(redactPayload(42)).toBe(42);
    expect(redactPayload(null)).toBeNull();
    expect(redactPayload(undefined)).toBeUndefined();
  });

  // 5. Falha silenciosa: prisma.createMany lança mas recordExternalAudit não relança
  it("5. falha silenciosa — erro no Prisma não propaga para o caller", async () => {
    const createMany = jest.fn().mockRejectedValue(new Error("DB down"));
    const prisma = mockPrisma({ mcpAuditLog: { createMany } });

    const fields: ExternalAuditFields = {
      apiKeyId: "key-003",
      toolId: "crm.res_partner.create",
      requestId: "req-003",
      input: { name: "Test" },
      status: "success",
      httpStatus: 200,
      durationMs: 15,
      operation: "write",
    };

    // Não deve lançar
    await expect(recordExternalAudit(prisma as any, fields)).resolves.toBeUndefined();
  });

  // 6. Audit de rate_limited mapeia para outcome "denied" (legado)
  it("6. status rate_limited → outcome legado 'denied'", async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = mockPrisma({ mcpAuditLog: { createMany } });

    await recordExternalAudit(prisma as any, {
      apiKeyId: "key-004",
      toolId: "test.tool",
      requestId: "req-004",
      input: {},
      status: "rate_limited",
      httpStatus: 429,
      durationMs: 1,
      operation: "read",
    });

    const callData = createMany.mock.calls[0][0].data[0];
    expect(callData.outcome).toBe("denied");
    expect(callData.status).toBe("rate_limited");
    expect(callData.httpStatus).toBe(429);
  });

  // 7. Audit de validation_error mapeia para outcome "invalid_input" (legado)
  it("7. status validation_error → outcome legado 'invalid_input'", async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = mockPrisma({ mcpAuditLog: { createMany } });

    await recordExternalAudit(prisma as any, {
      apiKeyId: "key-005",
      toolId: "test.tool",
      requestId: "req-005",
      input: { name: "" },
      status: "validation_error",
      httpStatus: 400,
      durationMs: 2,
      operation: "write",
      errorCode: "validation_failed",
    });

    const callData = createMany.mock.calls[0][0].data[0];
    expect(callData.outcome).toBe("invalid_input");
    expect(callData.status).toBe("validation_error");
    expect(callData.errorCode).toBe("validation_failed");
  });
});
