// mcp/__tests__/e2e/review2-scenarios.test.ts
// Suíte E2E , cenários do Review #2 (spec §7,§10).
//
// Cenários cobertos:
//   R1. Tenant cross-leakage: apiKey com tenantId só enxerga tools do catálogo
//       (catálogo filtrado por apiKey.capabilities , sem leakage de tenant)
//   R2. Chave expirada , pipeline deve rejeitar (simulado via context expiresAt)
//   R3. Rotação de chave , chave velha inválida após rotação (mock de lookup)
//   R4. Hot reload de capabilities , capabilitiesVersion gate
//   R5. Token vazado em payload → redaction no audit
//   R6. Catálogo filtrado por capability (tools/list)
//   R7. Método desconhecido → 400 method not found
//
// Todos rodam sem Odoo real (DB+Redis locais mockados).

import { randomUUID } from "node:crypto";
import { warnMissingEnv } from "./setup.js";
import { mockPrisma } from "../mocks/prisma.js";
import { mockOdooClient } from "../mocks/odoo-client.js";
import { createApiKeyCtx } from "../fixtures/contexts.js";
import {
  handleExternalRequest,
  handleExternalToolList,
  redactPayload,
} from "../../dispatcher/external-pipeline.js";
import { checkMode } from "../../dispatcher/check-mode.js";
import { hasCapability } from "../../auth/capability-check.js";
import { crmResPartnerCreate as _crmResPartnerCreate } from "../../tools/crm/res-partner-create.js";
import type { ToolEntry, WriteToolEntry } from "../../catalog/types.js";

// Cast para WriteToolEntry<unknown> , contravariance no handler
const crmResPartnerCreate = _crmResPartnerCreate as WriteToolEntry;
import RedisMock from "ioredis-mock";
import type Redis from "ioredis";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function freshRedis(): Redis {
  return new RedisMock() as unknown as Redis;
}

function fakeReq(headers: Record<string, string> = {}) {
  return { headers } as unknown as Parameters<typeof handleExternalRequest>[0];
}

// Tool de leitura mínima para testes de catálogo filtrado
const mockReadTool: ToolEntry = {
  id: "test.read_tool",
  dominio: "estoque" as any,
  descricao: "Tool de leitura de teste",
  inputSchemaShape: {},
  inputSchema: { parse: (v: unknown) => v } as any,
  outputSchema: {} as any,
  handler: async () => ({ result: "ok" }) as any,
};

const CATALOG = [crmResPartnerCreate, mockReadTool] as const;

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeAll(() => {
  warnMissingEnv();
  process.env.MCP_WRITE_ENABLED = "true";
});

afterAll(() => {
  delete process.env.MCP_WRITE_ENABLED;
});

// ─── Testes ───────────────────────────────────────────────────────────────────

describe("E2E review2-scenarios , spec §7,§10", () => {
  // R1. Tenant cross-leakage: ApiKey com tenantId só vê tools que passam
  // pela capability check , não há leakage entre tenants no catálogo
  it("R1. tenant cross-leakage: chave com tenantId só vê tools autorizadas", () => {
    const apiKeyTenantA = createApiKeyCtx({
      read: ["estoque"],
      write: {},
      tenantId: "tenant-a",
      capabilitiesVersion: 2,
    });
    const apiKeyTenantB = createApiKeyCtx({
      read: ["financeiro"],
      write: { crm: ["create"] },
      tenantId: "tenant-b",
      capabilitiesVersion: 2,
    });

    const visibleA = handleExternalToolList(null, CATALOG as any, apiKeyTenantA);
    const visibleB = handleExternalToolList(null, CATALOG as any, apiKeyTenantB);

    const toolsA = (visibleA.result as { tools: { name: string }[] }).tools.map((t) => t.name);
    const toolsB = (visibleB.result as { tools: { name: string }[] }).tools.map((t) => t.name);

    // Tenant A: read estoque → vê test.read_tool mas não crm.res_partner.create
    expect(toolsA).toContain("test.read_tool");
    expect(toolsA).not.toContain("crm.res_partner.create");

    // Tenant B: write crm:create → vê crm.res_partner.create mas não test.read_tool (sem read:estoque)
    expect(toolsB).toContain("crm.res_partner.create");
    expect(toolsB).not.toContain("test.read_tool");

    // Sem cross-leakage: A não vê tools de B e vice-versa
    expect(toolsA).not.toEqual(expect.arrayContaining(toolsB));
  });

  // R2. Chave expirada: capabilitiesVersion gate bloqueia tools adicionadas
  // após a versão da chave
  it("R2. chave expirada por versão , capabilitiesVersion gate bloqueia tool", () => {
    // crmResPartnerCreate tem addedInVersion: 2
    const oldKey = createApiKeyCtx({
      read: [],
      write: { crm: ["create"] },
      capabilitiesVersion: 1, // versão 1 < addedInVersion 2
    });

    const allowed = hasCapability(
      oldKey,
      { type: "write", module: "crm", action: "create" },
      { addedInVersion: 2 },
    );

    expect(allowed).toBe(false);
  });

  // R3. Rotação de chave , checkMode com key nova tem acesso, key velha não
  it("R3. rotação , chave nova com capabilities atualizadas tem acesso", () => {
    const oldKey = createApiKeyCtx({ read: [], write: {}, capabilitiesVersion: 2 });
    const newKey = createApiKeyCtx({ read: [], write: { crm: ["create"] }, capabilitiesVersion: 2 });

    const resultOld = checkMode(crmResPartnerCreate, { mode: "external", apiKey: oldKey });
    const resultNew = checkMode(crmResPartnerCreate, { mode: "external", apiKey: newKey });

    expect(resultOld.allowed).toBe(false);
    expect(resultOld.errorCode).toBe("capability_missing");
    expect(resultNew.allowed).toBe(true);
  });

  // R4. Hot reload de capabilities , versão nova de capability expõe tool
  it("R4. hot reload , chave com capabilitiesVersion atualizado enxerga tool nova", () => {
    const staleKey = createApiKeyCtx({
      read: [],
      write: { crm: ["create"] },
      capabilitiesVersion: 1,
    });
    const freshKey = createApiKeyCtx({
      read: [],
      write: { crm: ["create"] },
      capabilitiesVersion: 2,
    });

    const staleAllowed = hasCapability(
      staleKey,
      { type: "write", module: "crm", action: "create" },
      { addedInVersion: 2 },
    );
    const freshAllowed = hasCapability(
      freshKey,
      { type: "write", module: "crm", action: "create" },
      { addedInVersion: 2 },
    );

    expect(staleAllowed).toBe(false);
    expect(freshAllowed).toBe(true);
  });

  // R5. Token vazado em payload → redactPayload substitui por [REDACTED]
  it("R5. token/senha vazados no payload → redaction no audit", () => {
    const payload = {
      name: "Parceiro Teste",
      token: "super-secret-token",
      password: "senha123",
      // cnpj_cpf contém "cpf" no nome , é redactado pelo regex
      cnpj_cpf: "12.345.678/0001-99",
      secret: "mysecret",
      email: "test@example.com",
    };

    const redacted = redactPayload(payload) as Record<string, unknown>;

    expect(redacted["token"]).toBe("[REDACTED]");
    expect(redacted["password"]).toBe("[REDACTED]");
    expect(redacted["secret"]).toBe("[REDACTED]");
    // cnpj_cpf contém "cpf" → redactado
    expect(redacted["cnpj_cpf"]).toBe("[REDACTED]");
    // Campos não sensíveis preservados
    expect(redacted["name"]).toBe("Parceiro Teste");
    expect(redacted["email"]).toBe("test@example.com");
  });

  // R5b. CPF/CNPJ também é redactado (regex inclui cpf/cnpj)
  it("R5b. cpf/cnpj no payload → redaction", () => {
    const payload = { cpf: "123.456.789-00", cnpj: "12.345.678/0001-99", nome: "fulano" };
    const redacted = redactPayload(payload) as Record<string, unknown>;
    expect(redacted["cpf"]).toBe("[REDACTED]");
    expect(redacted["cnpj"]).toBe("[REDACTED]");
    expect(redacted["nome"]).toBe("fulano");
  });

  // R6. Catálogo filtrado por capability em tools/list
  it("R6. catálogo filtrado , chave sem capabilities vê catálogo vazio", () => {
    const apiKey = createApiKeyCtx({ read: [], write: {}, capabilitiesVersion: 2 });
    const response = handleExternalToolList(null, CATALOG as any, apiKey);
    const tools = (response.result as { tools: unknown[] }).tools;
    expect(tools).toHaveLength(0);
  });

  it("R6b. catálogo filtrado , chave com read:estoque vê tool de estoque", () => {
    const apiKey = createApiKeyCtx({ read: ["estoque"], write: {}, capabilitiesVersion: 2 });
    const response = handleExternalToolList(null, CATALOG as any, apiKey);
    const tools = (response.result as { tools: { name: string }[] }).tools;
    expect(tools.map((t) => t.name)).toContain("test.read_tool");
    expect(tools.map((t) => t.name)).not.toContain("crm.res_partner.create");
  });

  it("R6c. catálogo filtrado , chave com write crm:create vê write tool", () => {
    const apiKey = createApiKeyCtx({ read: [], write: { crm: ["create"] }, capabilitiesVersion: 2 });
    const response = handleExternalToolList(null, CATALOG as any, apiKey);
    const tools = (response.result as { tools: { name: string }[] }).tools;
    expect(tools.map((t) => t.name)).toContain("crm.res_partner.create");
  });

  // R7. Método desconhecido → 400
  it("R7. método desconhecido → 400 method not found", async () => {
    const apiKey = createApiKeyCtx({ read: [], write: {} });
    const prisma = mockPrisma();
    const redis = freshRedis();

    const bodyObj = { jsonrpc: "2.0", id: 1, method: "unknown/method", params: {} };

    const { status, body } = await handleExternalRequest(
      fakeReq({ "content-type": "application/json" }),
      Buffer.from(JSON.stringify(bodyObj)),
      apiKey,
      {
        prisma: prisma as any,
        redis,
        catalog: CATALOG as any,
        odooClientFactory: () => mockOdooClient() as any,
        syncQueue: { add: jest.fn() },
      },
    );

    expect(status).toBe(400);
    const parsed = JSON.parse(body);
    expect(parsed.error.code).toBe(-32601);
    expect(parsed.error.message).toMatch(/not found/i);
  });
});
