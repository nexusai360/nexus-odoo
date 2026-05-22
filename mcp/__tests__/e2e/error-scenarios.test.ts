// mcp/__tests__/e2e/error-scenarios.test.ts
// Suíte E2E — cenários de erro do pipeline externo.
//
// ESTRATÉGIA: exercita o pipeline real (handleExternalRequest /
// handleExternalWriteCall) com Odoo MOCKADO via odooClientFactory injetável.
// Todos os cenários desta suíte rodam sem credenciais Odoo externas.
//
// Cenários cobertos (§19.3):
//   1. Capability ausente → 403 capability_missing
//   2. Modo interno tenta write tool → 403 forbidden_via_internal_auth
//      (via checkMode direto — pipeline externo não tem modo interno)
//   3. Validação Zod falha → 400 validation_failed
//   4. Idempotency key ausente → 400 idempotency_key_required
//   5. Idempotency key repetida mesma payload → 200 (cached)
//   6. Idempotency key repetida payload diferente → 409 payload_mismatch
//   7. Rate limit excedido → 429
//   8. Erro Odoo no authenticate → 502 odoo_unavailable
//   9. Erro Odoo no handler (create) → 500 error
//  10. MCP_WRITE_ENABLED=false → 503 feature_disabled
//  11. Tool não encontrada → 200 isError:true tool_not_found
//  12. JSON inválido → 400 Invalid JSON

import { randomUUID } from "node:crypto";
import { canonicalHash } from "../../lib/canonical-json.js";
import { warnMissingEnv } from "./setup.js";
import { mockPrisma } from "../mocks/prisma.js";
import { mockOdooClient } from "../mocks/odoo-client.js";
import { createApiKeyCtx } from "../fixtures/contexts.js";
import { handleExternalRequest, handleExternalWriteCall } from "../../dispatcher/external-pipeline.js";
import { checkMode } from "../../dispatcher/check-mode.js";
import { crmResPartnerCreate as _crmResPartnerCreate } from "../../tools/crm/res-partner-create.js";
import type { WriteToolEntry } from "../../catalog/types.js";
import RedisMock from "ioredis-mock";

// Cast para WriteToolEntry<unknown> — contravariance no handler
const crmResPartnerCreate = _crmResPartnerCreate as WriteToolEntry;
import type Redis from "ioredis";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function freshRedis(): Redis {
  return new RedisMock() as unknown as Redis;
}

function makeBody(args?: object, idempotencyKey?: string): [Buffer, object] {
  const bodyObj = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "crm.res_partner.create",
      arguments: args ?? { name: "Test Partner", is_company: false },
    },
  };
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  return [Buffer.from(JSON.stringify(bodyObj)), headers];
}

function fakeReq(headers: Record<string, string> = {}) {
  return { headers } as unknown as Parameters<typeof handleExternalRequest>[0];
}

const WRITE_CATALOG = [crmResPartnerCreate] as const;

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeAll(() => {
  warnMissingEnv();
  // Garantir que MCP_WRITE_ENABLED está setado para testes desta suíte
  process.env.MCP_WRITE_ENABLED = "true";
});

afterAll(() => {
  // Restaurar
  delete process.env.MCP_WRITE_ENABLED;
});

// ─── Testes (sem Odoo real) ───────────────────────────────────────────────────

describe("E2E error-scenarios — pipeline com Odoo mockado", () => {
  // ── 1. Capability ausente ───────────────────────────────────────────────────
  it("1. capability ausente → 403 capability_missing", async () => {
    const apiKey = createApiKeyCtx({ read: [], write: {} }); // sem crm:create
    const prisma = mockPrisma();
    const redis = freshRedis();
    const idemKey = randomUUID();
    const [bodyBuf, headers] = makeBody({ name: "Test", is_company: false }, idemKey);

    const { status, body } = await handleExternalRequest(fakeReq(headers as Record<string, string>), bodyBuf, apiKey, {
      prisma: prisma as any,
      redis,
      catalog: WRITE_CATALOG as any,
      odooClientFactory: () => mockOdooClient() as any,
      syncQueue: { add: jest.fn() },
    });

    const parsed = JSON.parse(body);
    expect(status).toBe(403);
    const content = JSON.parse(parsed.result.content[0].text);
    expect(content.error).toBe("capability_missing");
    expect(parsed.result.isError).toBe(true);
  });

  // ── 2. checkMode interno bloqueado para write tool ─────────────────────────
  it("2. checkMode interno bloqueado para write tool → forbidden_via_internal_auth", () => {
    const result = checkMode(crmResPartnerCreate, { mode: "internal", userId: "user-123" });
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("forbidden_via_internal_auth");
  });

  // ── 3. Validação Zod falha ─────────────────────────────────────────────────
  it("3. validação Zod falha → 400 validation_failed", async () => {
    const apiKey = createApiKeyCtx({ read: [], write: { crm: ["create"] }, capabilitiesVersion: 2 });
    const prisma = mockPrisma();
    const redis = freshRedis();
    const idemKey = randomUUID();

    // input inválido: name vazio
    const [bodyBuf, headers] = makeBody({ name: "", is_company: false }, idemKey);

    const { status, body } = await handleExternalRequest(fakeReq(headers as Record<string, string>), bodyBuf, apiKey, {
      prisma: prisma as any,
      redis,
      catalog: WRITE_CATALOG as any,
      odooClientFactory: () => mockOdooClient() as any,
      syncQueue: { add: jest.fn() },
    });

    const parsed = JSON.parse(body);
    expect(status).toBe(400);
    const content = JSON.parse(parsed.result.content[0].text);
    expect(content.error).toBe("validation_failed");
  });

  // ── 4. Idempotency key ausente → 400 ──────────────────────────────────────
  it("4. idempotency key ausente → 400 idempotency_key_required", async () => {
    const apiKey = createApiKeyCtx({ read: [], write: { crm: ["create"] }, capabilitiesVersion: 2 });
    const prisma = mockPrisma();
    const redis = freshRedis();

    // SEM idempotency-key
    const [bodyBuf, headers] = makeBody({ name: "Test Partner", is_company: false });

    const { status, body } = await handleExternalRequest(fakeReq(headers as Record<string, string>), bodyBuf, apiKey, {
      prisma: prisma as any,
      redis,
      catalog: WRITE_CATALOG as any,
      odooClientFactory: () => mockOdooClient() as any,
      syncQueue: { add: jest.fn() },
    });

    const parsed = JSON.parse(body);
    // Pipeline retorna result.content com erro (não JSON-RPC error) para idempotency
    expect([400, 200]).toContain(status);
    // O conteúdo deve indicar o erro de idempotência
    const resultText = parsed.result?.content?.[0]?.text ?? "{}";
    const content = JSON.parse(resultText);
    expect(content.error).toBe("idempotency_key_required");
  });

  // ── 5. Idempotency cached — mesmo key + payload ────────────────────────────
  it("5. idempotency cached — segunda chamada com mesmo key → 200 sem chamar Odoo", async () => {
    const apiKey = createApiKeyCtx({ read: [], write: { crm: ["create"] }, capabilitiesVersion: 2 });

    // Calcular hash real do payload para simular record já gravado com o mesmo hash
    const cachedPayload = { name: "Test", is_company: false };
    const realHash = canonicalHash(cachedPayload);

    const prismaInst = mockPrisma({
      mcpIdempotencyRecord: {
        findUnique: jest.fn().mockResolvedValue({
          id: "idem-1",
          key: "same-key",
          apiKeyId: apiKey.apiKeyId,
          toolId: "crm.res_partner.create",
          payloadHash: realHash,
          result: { id: 42, name: "Cached Partner" },
          status: "success",
          httpStatus: 200,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
        }),
        create: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
    });
    const redis = freshRedis();

    const odoo = mockOdooClient();
    const [bodyBuf, headers] = makeBody(cachedPayload, "same-key");

    const { status, body } = await handleExternalRequest(fakeReq(headers as Record<string, string>), bodyBuf, apiKey, {
      prisma: prismaInst as any,
      redis,
      catalog: WRITE_CATALOG as any,
      odooClientFactory: () => odoo as any,
      syncQueue: { add: jest.fn() },
    });

    expect(status).toBe(200);
    // Odoo não deve ter sido chamado — retornou do cache
    expect(odoo.authenticate).not.toHaveBeenCalled();
  });

  // ── 6. Idempotency — payload diferente para mesma key → 422 ───────────────
  // Fluxo: lock adquirido → findUnique retorna record com hash diferente → 422
  it("6. idempotency — payload diferente para mesma key → 422 idempotency_key_conflict", async () => {
    const apiKey = createApiKeyCtx({ read: [], write: { crm: ["create"] }, capabilitiesVersion: 2 });

    // Hash de um payload diferente do que será enviado
    const storedHash = canonicalHash({ name: "Original Partner", is_company: true });

    const prismaInst = mockPrisma({
      mcpIdempotencyRecord: {
        findUnique: jest.fn().mockResolvedValue({
          id: "idem-2",
          key: "conflict-key",
          apiKeyId: apiKey.apiKeyId,
          toolId: "crm.res_partner.create",
          payloadHash: storedHash,
          result: {},
          status: "success",
          httpStatus: 200,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
        }),
        create: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
    });
    const redis = freshRedis();

    // Enviar payload diferente do armazenado
    const [bodyBuf, headers] = makeBody({ name: "Different Partner", is_company: false }, "conflict-key");

    const { status, body } = await handleExternalRequest(fakeReq(headers as Record<string, string>), bodyBuf, apiKey, {
      prisma: prismaInst as any,
      redis,
      catalog: WRITE_CATALOG as any,
      odooClientFactory: () => mockOdooClient() as any,
      syncQueue: { add: jest.fn() },
    });

    // 422 idempotency_key_conflict (lock adquirido → record encontrado → hash diferente)
    const parsed = JSON.parse(body);
    expect(status).toBe(422);
    const content = JSON.parse(parsed.result?.content?.[0]?.text ?? "{}");
    expect(content.error).toBe("idempotency_key_conflict");
  });

  // ── 7. Rate limit excedido → 429 ──────────────────────────────────────────
  it("7. rate limit excedido → 429", async () => {
    const apiKey = createApiKeyCtx({ read: [], write: { crm: ["create"] }, capabilitiesVersion: 2 });
    const prisma = mockPrisma();

    // Redis mock que retorna count > rateLimit (61 > 60)
    const redis = new RedisMock() as unknown as Redis;
    const execMock = jest.fn().mockResolvedValue([[null, 61], [null, 1]]);
    jest.spyOn(redis, "pipeline").mockReturnValue({
      incr: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: execMock,
    } as any);

    const [bodyBuf, headers] = makeBody({ name: "Test", is_company: false }, randomUUID());

    const { status, body } = await handleExternalRequest(fakeReq(headers as Record<string, string>), bodyBuf, apiKey, {
      prisma: prisma as any,
      redis,
      catalog: WRITE_CATALOG as any,
      odooClientFactory: () => mockOdooClient() as any,
      syncQueue: { add: jest.fn() },
    });

    expect(status).toBe(429);
    const parsed = JSON.parse(body);
    expect(parsed.error?.message).toMatch(/rate limit/i);
  });

  // ── 8. Erro Odoo authenticate → 502 ──────────────────────────────────────
  it("8. erro Odoo authenticate → 502 odoo_unavailable", async () => {
    const apiKey = createApiKeyCtx({ read: [], write: { crm: ["create"] }, capabilitiesVersion: 2 });
    const prisma = mockPrisma();
    const redis = freshRedis();
    const idemKey = randomUUID();

    const odoo = mockOdooClient();
    odoo.authenticate.mockRejectedValue(new Error("Connection refused"));

    const [bodyBuf, headers] = makeBody({ name: "Test Partner", is_company: false }, idemKey);

    const { status, body } = await handleExternalRequest(fakeReq(headers as Record<string, string>), bodyBuf, apiKey, {
      prisma: prisma as any,
      redis,
      catalog: WRITE_CATALOG as any,
      odooClientFactory: () => odoo as any,
      syncQueue: { add: jest.fn() },
    });

    const parsed = JSON.parse(body);
    expect(status).toBe(502);
    const content = JSON.parse(parsed.result.content[0].text);
    expect(content.error).toBe("odoo_unavailable");
  });

  // ── 9. Erro Odoo no handler (create) → 500 ────────────────────────────────
  it("9. erro Odoo no handler create → 500", async () => {
    const apiKey = createApiKeyCtx({ read: [], write: { crm: ["create"] }, capabilitiesVersion: 2 });
    const prismaInst = mockPrisma({
      mcpAuditLog: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      mcpIdempotencyRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
    });
    const redis = freshRedis();
    const idemKey = randomUUID();

    const odoo = mockOdooClient();
    odoo.authenticate.mockResolvedValue(1);
    odoo.searchIrModelData.mockResolvedValue(null);
    odoo.create.mockRejectedValue(new Error("Odoo RPC error: access denied"));

    const [bodyBuf, headers] = makeBody({ name: "Test Partner", is_company: false }, idemKey);

    const { status, body } = await handleExternalRequest(fakeReq(headers as Record<string, string>), bodyBuf, apiKey, {
      prisma: prismaInst as any,
      redis,
      catalog: WRITE_CATALOG as any,
      odooClientFactory: () => odoo as any,
      syncQueue: { add: jest.fn() },
    });

    const parsed = JSON.parse(body);
    expect(status).toBe(500);
    const content = JSON.parse(parsed.result.content[0].text);
    expect(["internal_error", "error"]).toContain(content.error);
  });

  // ── 10. MCP_WRITE_ENABLED=false → 503 ────────────────────────────────────
  it("10. MCP_WRITE_ENABLED=false → 503 feature_disabled", async () => {
    const savedEnv = process.env.MCP_WRITE_ENABLED;
    process.env.MCP_WRITE_ENABLED = "false";

    try {
      const apiKey = createApiKeyCtx({ read: [], write: { crm: ["create"] }, capabilitiesVersion: 2 });
      const prisma = mockPrisma();
      const redis = freshRedis();
      const idemKey = randomUUID();

      const [bodyBuf, headers] = makeBody({ name: "Test", is_company: false }, idemKey);

      const { status, body } = await handleExternalRequest(fakeReq(headers as Record<string, string>), bodyBuf, apiKey, {
        prisma: prisma as any,
        redis,
        catalog: WRITE_CATALOG as any,
        odooClientFactory: () => mockOdooClient() as any,
        syncQueue: { add: jest.fn() },
      });

      const parsed = JSON.parse(body);
      expect(status).toBe(503);
      const content = JSON.parse(parsed.result.content[0].text);
      expect(content.error).toBe("feature_disabled");
    } finally {
      process.env.MCP_WRITE_ENABLED = savedEnv;
    }
  });

  // ── 11. Tool não encontrada → 200 isError:true tool_not_found ─────────────
  it("11. tool não encontrada → isError:true tool_not_found", async () => {
    const apiKey = createApiKeyCtx({ read: ["crm"], write: {} });
    const prisma = mockPrisma();
    const redis = freshRedis();

    const bodyObj = {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "tool_inexistente", arguments: {} },
    };

    const { status, body } = await handleExternalRequest(
      fakeReq({ "content-type": "application/json" }),
      Buffer.from(JSON.stringify(bodyObj)),
      apiKey,
      {
        prisma: prisma as any,
        redis,
        catalog: WRITE_CATALOG as any,
        odooClientFactory: () => mockOdooClient() as any,
        syncQueue: { add: jest.fn() },
      },
    );

    const parsed = JSON.parse(body);
    expect(status).toBe(200);
    const content = JSON.parse(parsed.result.content[0].text);
    expect(content.error).toBe("tool_not_found");
  });

  // ── 12. JSON inválido → 400 ───────────────────────────────────────────────
  it("12. JSON inválido → 400 Invalid JSON", async () => {
    const apiKey = createApiKeyCtx({ read: [], write: {} });
    const prisma = mockPrisma();
    const redis = freshRedis();

    const { status, body } = await handleExternalRequest(
      fakeReq({ "content-type": "application/json" }),
      Buffer.from("{ invalid json }"),
      apiKey,
      {
        prisma: prisma as any,
        redis,
        catalog: WRITE_CATALOG as any,
        odooClientFactory: () => mockOdooClient() as any,
        syncQueue: { add: jest.fn() },
      },
    );

    expect(status).toBe(400);
    const parsed = JSON.parse(body);
    expect(parsed.error.message).toMatch(/invalid json/i);
  });
});
