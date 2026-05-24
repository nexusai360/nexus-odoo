// mcp/dispatcher/__tests__/external-audit.test.ts
// TDD para recordExternalAudit e redactPayload do external-pipeline.
//
// Cobre:
//   1. redactPayload , campos sensíveis são redactados
//   2. redactPayload , campos não-sensíveis preservados
//   3. redactPayload , non-object passthrough
//   4. recordExternalAudit , campos completos gravados via createMany
//   5. recordExternalAudit , suppressPayload (§10.5: token inválido)
//   6. recordExternalAudit , campos legados sempre preenchidos
//   7. recordExternalAudit , falha silenciosa (não lança)
//   8. recordExternalAudit , read tool com dominio

import { redactPayload, recordExternalAudit } from "../external-pipeline.js";
import type { PrismaClient } from "@/generated/prisma/client";
import { mockPrisma } from "../../__tests__/mocks/prisma.js";

// ─── 1,3. redactPayload ───────────────────────────────────────────────────────

describe("redactPayload , campos sensíveis", () => {
  it("redacta campos cujo nome contém 'cpf'", () => {
    const result = redactPayload({ cpf: "123.456.789-00", nome: "João" }) as Record<string, unknown>;
    expect(result["cpf"]).toBe("[REDACTED]");
    expect(result["nome"]).toBe("João");
  });

  it("redacta campos com 'senha', 'password', 'token', 'secret', 'cnpj'", () => {
    const input = {
      senha: "abc",
      password: "xyz",
      token: "tok",
      secret: "sec",
      cnpj: "12.345.678/0001-90",
      nome: "Empresa",
    };
    const result = redactPayload(input) as Record<string, unknown>;
    expect(result["senha"]).toBe("[REDACTED]");
    expect(result["password"]).toBe("[REDACTED]");
    expect(result["token"]).toBe("[REDACTED]");
    expect(result["secret"]).toBe("[REDACTED]");
    expect(result["cnpj"]).toBe("[REDACTED]");
    expect(result["nome"]).toBe("Empresa");
  });

  it("redacta case-insensitive (CPF, Password, TOKEN)", () => {
    const result = redactPayload({ CPF: "123", Password: "abc", TOKEN: "tok" }) as Record<string, unknown>;
    expect(result["CPF"]).toBe("[REDACTED]");
    expect(result["Password"]).toBe("[REDACTED]");
    expect(result["TOKEN"]).toBe("[REDACTED]");
  });

  it("não muta o objeto original", () => {
    const original = { cpf: "123", nome: "x" };
    redactPayload(original);
    expect(original.cpf).toBe("123");
  });

  it("preserva campos não-sensíveis intactos", () => {
    const input = { name: "Test", email: "a@b.com", amount: 100 };
    const result = redactPayload(input) as Record<string, unknown>;
    expect(result["name"]).toBe("Test");
    expect(result["email"]).toBe("a@b.com");
    expect(result["amount"]).toBe(100);
  });

  it("retorna null passthrough", () => {
    expect(redactPayload(null)).toBeNull();
  });

  it("retorna string passthrough", () => {
    expect(redactPayload("texto")).toBe("texto");
  });

  it("retorna array passthrough (não processa)", () => {
    const arr = [{ cpf: "123" }];
    expect(redactPayload(arr)).toBe(arr);
  });
});

// ─── 4,8. recordExternalAudit ────────────────────────────────────────────────

describe("recordExternalAudit , campos completos", () => {
  let prismaInst: ReturnType<typeof mockPrisma>;

  beforeEach(() => {
    prismaInst = mockPrisma();
    (prismaInst.mcpAuditLog.createMany as jest.Mock).mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("chama createMany (não create) para respeitar menor privilégio", async () => {
    await recordExternalAudit(prismaInst as unknown as PrismaClient, {
      apiKeyId: "key-1",
      toolId: "crm.res_partner.create",
      requestId: "req-1",
      input: { name: "Test" },
      status: "success",
      httpStatus: 200,
      durationMs: 100,
      operation: "write",
      module: "crm",
      action: "create",
    });

    expect(prismaInst.mcpAuditLog.createMany).toHaveBeenCalledTimes(1);
    expect(prismaInst.mcpAuditLog.create).not.toHaveBeenCalled();
  });

  it("grava todos os campos novos da migration F4 Onda 2", async () => {
    await recordExternalAudit(prismaInst as unknown as PrismaClient, {
      apiKeyId: "key-2",
      toolId: "crm.res_partner.create",
      requestId: "req-2",
      idempotencyKey: "idem-1",
      input: { name: "Acme" },
      status: "success",
      httpStatus: 200,
      durationMs: 150,
      operation: "write",
      module: "crm",
      action: "create",
      capability: "crm.create",
      eventName: "crm.create",
      snapshotBefore: null,
      snapshotAfter: { id: 42, name: "Acme" },
      resultData: { id: 42 },
    });

    const call = (prismaInst.mcpAuditLog.createMany as jest.Mock).mock.calls[0][0] as {
      data: Record<string, unknown>[];
    };
    const data = call.data[0];

    expect(data["authMode"]).toBe("external");
    expect(data["operation"]).toBe("write");
    expect(data["module"]).toBe("crm");
    expect(data["action"]).toBe("create");
    expect(data["capability"]).toBe("crm.create");
    expect(data["eventName"]).toBe("crm.create");
    expect(data["requestId"]).toBe("req-2");
    expect(data["idempotencyKey"]).toBe("idem-1");
    expect(data["apiKeyId"]).toBe("key-2");
    expect(data["status"]).toBe("success");
    expect(data["httpStatus"]).toBe(200);
    expect(data["snapshotAfter"]).toEqual({ id: 42, name: "Acme" });
  });

  it("grava campos legados compatíveis (userId, tool, params, outcome)", async () => {
    await recordExternalAudit(prismaInst as unknown as PrismaClient, {
      apiKeyId: "key-3",
      toolId: "estoque_saldo_produto",
      requestId: "req-3",
      input: { produto_id: 1 },
      status: "success",
      httpStatus: 200,
      durationMs: 50,
      operation: "read",
    });

    const call = (prismaInst.mcpAuditLog.createMany as jest.Mock).mock.calls[0][0] as {
      data: Record<string, unknown>[];
    };
    const data = call.data[0];

    expect(data["userId"]).toBe("key-3");
    expect(data["tool"]).toBe("estoque_saldo_produto");
    expect(data["outcome"]).toBe("ok");
    expect(data["durationMs"]).toBe(50);
  });

  it("mapeia outcome legado corretamente para cada status", async () => {
    const cases: Array<{ status: string; expectedOutcome: string }> = [
      { status: "success", expectedOutcome: "ok" },
      { status: "denied", expectedOutcome: "denied" },
      { status: "rate_limited", expectedOutcome: "denied" },
      { status: "validation_error", expectedOutcome: "invalid_input" },
      { status: "error", expectedOutcome: "error" },
      { status: "odoo_error", expectedOutcome: "error" },
    ];

    for (const { status, expectedOutcome } of cases) {
      jest.clearAllMocks();
      await recordExternalAudit(prismaInst as unknown as PrismaClient, {
        apiKeyId: "k", toolId: "t", requestId: "r",
        input: {}, status, httpStatus: 200, durationMs: 1, operation: "read",
      });
      const call = (prismaInst.mcpAuditLog.createMany as jest.Mock).mock.calls[0][0] as {
        data: Record<string, unknown>[];
      };
      expect(call.data[0]["outcome"]).toBe(expectedOutcome);
    }
  });

  it("§10.5: suppressPayload=true → payload e params ficam vazios", async () => {
    await recordExternalAudit(prismaInst as unknown as PrismaClient, {
      apiKeyId: "key-4",
      toolId: "crm.res_partner.create",
      requestId: "req-4",
      input: { cpf: "123.456.789-00", name: "Test" },
      status: "denied",
      httpStatus: 401,
      durationMs: 10,
      operation: "write",
      suppressPayload: true,
    });

    const call = (prismaInst.mcpAuditLog.createMany as jest.Mock).mock.calls[0][0] as {
      data: Record<string, unknown>[];
    };
    const data = call.data[0];

    // params legado deve ser objeto vazio (não o input real)
    expect(data["params"]).toEqual({});
    // payload novo deve ser null
    expect(data["payload"]).toBeNull();
  });

  it("redacta PII no payload (cpf, senha) mesmo sem suppressPayload", async () => {
    await recordExternalAudit(prismaInst as unknown as PrismaClient, {
      apiKeyId: "key-5",
      toolId: "t",
      requestId: "r",
      input: { name: "João", cpf: "123.456.789-00", senha: "secret" },
      status: "success",
      httpStatus: 200,
      durationMs: 10,
      operation: "write",
    });

    const call = (prismaInst.mcpAuditLog.createMany as jest.Mock).mock.calls[0][0] as {
      data: Record<string, unknown>[];
    };
    const payload = call.data[0]["payload"] as Record<string, unknown>;
    expect(payload["cpf"]).toBe("[REDACTED]");
    expect(payload["senha"]).toBe("[REDACTED]");
    expect(payload["name"]).toBe("João");
  });

  it("falha silenciosa , não lança mesmo se createMany rejeitar", async () => {
    (prismaInst.mcpAuditLog.createMany as jest.Mock).mockRejectedValue(new Error("DB error"));

    await expect(
      recordExternalAudit(prismaInst as unknown as PrismaClient, {
        apiKeyId: "k", toolId: "t", requestId: "r",
        input: {}, status: "success", httpStatus: 200, durationMs: 1, operation: "read",
      }),
    ).resolves.toBeUndefined();
  });

  it("grava module a partir de tool.dominio para read tools", async () => {
    await recordExternalAudit(prismaInst as unknown as PrismaClient, {
      apiKeyId: "key-6",
      toolId: "estoque_saldo_produto",
      requestId: "req-6",
      input: {},
      status: "success",
      httpStatus: 200,
      durationMs: 20,
      operation: "read",
      module: "estoque",
    });

    const call = (prismaInst.mcpAuditLog.createMany as jest.Mock).mock.calls[0][0] as {
      data: Record<string, unknown>[];
    };
    expect(call.data[0]["module"]).toBe("estoque");
  });
});
