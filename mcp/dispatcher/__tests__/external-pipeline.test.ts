// mcp/dispatcher/__tests__/external-pipeline.test.ts
// TDD para o pipeline externo do Bloco P-0.
//
// Cobre:
//   1. tools/list filtrado por API key
//   2. tools/call write — sucesso
//   3. tools/call — capability_missing (checkMode denied)
//   4. tools/call write — kill switch off → 503
//   5. tools/call write — idempotency_key_required (write sem header)
//   6. tools/call write — idempotency cached → retorna resultado cacheado
//   7. tools/call — rate limit excedido → 429
//   8. tools/call read — sucesso
//
// Todos os testes usam mocks injetáveis — sem I/O real.

import * as http from "node:http";
import type { PrismaClient } from "@/generated/prisma/client";
import { z } from "zod";

import {
  handleExternalRequest,
  handleExternalToolList,
  type ExternalPipelineDeps,
} from "../external-pipeline.js";
import type { ToolEntry, WriteToolEntry, WriteToolResult } from "../../catalog/types.js";
import type { ApiKeyContext } from "../../auth/api-key-context.js";
import { mockPrisma } from "../../__tests__/mocks/prisma.js";
import { createMockRedis } from "../../__tests__/mocks/redis.js";
import { createApiKeyCtx } from "../../__tests__/fixtures/contexts.js";
import { mockOdooClient } from "../../__tests__/mocks/odoo-client.js";

// ─── Mocks de módulos pesados ────────────────────────────────────────────────

jest.mock("../../sync/queue.js", () => ({
  getDirectedSyncQueue: jest.fn(() => ({ add: jest.fn().mockResolvedValue(undefined) })),
}));

jest.mock("@/worker/odoo/client.js", () => ({
  clientFromEnv: jest.fn(),
}));

// ─── Helpers de fixture ──────────────────────────────────────────────────────

function makeReadTool(
  id: string,
  dominio: ToolEntry["dominio"] = "crm",
  handlerResult: unknown = { ok: true },
): ToolEntry {
  const schema = z.object({ q: z.string().optional() });
  return {
    id,
    dominio,
    descricao: `Read tool ${id}`,
    inputSchemaShape: { q: z.string().optional() },
    inputSchema: schema,
    outputSchema: z.unknown(),
    handler: jest.fn().mockResolvedValue(handlerResult),
  };
}

function makeWriteTool(
  id: string,
  module: string,
  action: string,
  handlerResult?: WriteToolResult<unknown>,
): WriteToolEntry {
  const schema = z.object({ name: z.string() });
  const result: WriteToolResult<unknown> = handlerResult ?? {
    id: 42,
    data: { id: 42, name: "created" },
    snapshotBefore: null,
    snapshotAfter: { id: 42, name: "created" },
  };
  return {
    id,
    operation: "write",
    module,
    descricao: `Write tool ${id}`,
    inputSchemaShape: { name: z.string() },
    inputSchema: schema,
    outputSchema: z.unknown(),
    capability: { module, action },
    sensitive: false,
    odooModel: "res.partner",
    eventName: `${module}.${action}`,
    requiresExternalAuth: true,
    handler: jest.fn().mockResolvedValue(result),
  };
}

function makeRequest(
  method: string,
  body: object,
  headers: Record<string, string> = {},
): { req: http.IncomingMessage; bodyBuffer: Buffer } {
  const bodyStr = JSON.stringify(body);
  const req = Object.assign(new http.IncomingMessage(null as never), {
    method,
    url: "/api/mcp",
    headers: { "content-type": "application/json", ...headers },
  });
  return { req, bodyBuffer: Buffer.from(bodyStr, "utf8") };
}

function makeDeps(
  overrides: Partial<ExternalPipelineDeps> & {
    catalog?: ReadonlyArray<ToolEntry | WriteToolEntry>;
    prismaOverrides?: Parameters<typeof mockPrisma>[0];
  } = {},
): ExternalPipelineDeps {
  const prismaInst = mockPrisma(overrides.prismaOverrides ?? {});
  (prismaInst.mcpAuditLog.createMany as jest.Mock).mockResolvedValue({ count: 1 });
  (prismaInst.mcpIdempotencyRecord.findUnique as jest.Mock).mockResolvedValue(null);
  (prismaInst.mcpIdempotencyRecord.create as jest.Mock).mockResolvedValue({});

  return {
    prisma: prismaInst as unknown as PrismaClient,
    redis: createMockRedis(),
    catalog: overrides.catalog ?? [],
    syncQueue: overrides.syncQueue ?? { add: jest.fn().mockResolvedValue(undefined) },
    odooClientFactory: overrides.odooClientFactory,
    serverVersion: "test-1.0",
  };
}

// ─── 1. tools/list filtrado ─────────────────────────────────────────────────

describe("handleExternalToolList — catálogo filtrado por API key", () => {
  it("retorna apenas tools da capability read:crm", () => {
    const apiKey = createApiKeyCtx({ read: ["crm"] });
    const readTool = makeReadTool("crm.res_partner.get", "crm");
    const otherTool = makeReadTool("estoque.produto.get", "estoque");
    const catalog: ReadonlyArray<ToolEntry | WriteToolEntry> = [readTool, otherTool];

    const response = handleExternalToolList(1, catalog, apiKey);

    expect(response.jsonrpc).toBe("2.0");
    expect(response.id).toBe(1);
    const result = response.result as { tools: Array<{ name: string }> };
    const names = result.tools.map((t) => t.name);
    expect(names).toContain("crm.res_partner.get");
    expect(names).not.toContain("estoque.produto.get");
  });

  it("inclui write tool se API key tem write capability", () => {
    const apiKey = createApiKeyCtx({ write: { crm: ["create"] }, capabilitiesVersion: 2 });
    const writeTool = makeWriteTool("crm.res_partner.create", "crm", "create");
    (writeTool as WriteToolEntry & { addedInVersion?: number }).addedInVersion = 2;
    const catalog: ReadonlyArray<ToolEntry | WriteToolEntry> = [writeTool];

    const response = handleExternalToolList(null, catalog, apiKey);

    const result = response.result as { tools: Array<{ name: string }> };
    expect(result.tools.map((t) => t.name)).toContain("crm.res_partner.create");
  });

  it("retorna lista vazia se API key sem capabilities", () => {
    const apiKey = createApiKeyCtx({ read: [], write: {} });
    const catalog: ReadonlyArray<ToolEntry | WriteToolEntry> = [
      makeReadTool("crm.res_partner.get", "crm"),
    ];

    const response = handleExternalToolList("req-1", catalog, apiKey);

    const result = response.result as { tools: unknown[] };
    expect(result.tools).toHaveLength(0);
  });
});

// ─── 2. tools/call write — sucesso ──────────────────────────────────────────

describe("handleExternalRequest — tools/call write sucesso", () => {
  beforeEach(() => {
    process.env.MCP_WRITE_ENABLED = "true";
  });

  afterEach(() => {
    delete process.env.MCP_WRITE_ENABLED;
    jest.clearAllMocks();
  });

  it("retorna resultado do handler com isError=false e _meta", async () => {
    const apiKey = createApiKeyCtx({ write: { crm: ["create"] }, capabilitiesVersion: 2 });
    const writeTool = makeWriteTool("crm.res_partner.create", "crm", "create");
    (writeTool as WriteToolEntry & { addedInVersion?: number }).addedInVersion = 1;

    const odooMock = mockOdooClient();
    (odooMock.authenticate as jest.Mock).mockResolvedValue(undefined);

    const deps = makeDeps({
      catalog: [writeTool] as ReadonlyArray<ToolEntry | WriteToolEntry>,
      odooClientFactory: () => odooMock as ReturnType<typeof import("@/worker/odoo/client.js").clientFromEnv>,
    });

    const { req, bodyBuffer } = makeRequest(
      "POST",
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "crm.res_partner.create", arguments: { name: "Test" } } },
      { "idempotency-key": "idem-001" },
    );

    const result = await handleExternalRequest(req, bodyBuffer, apiKey, deps);

    expect(result.status).toBe(200);
    const body = JSON.parse(result.body) as { result: { isError: boolean; _meta: { request_id: string } } };
    expect(body.result.isError).toBe(false);
    expect(body.result._meta.request_id).toBeDefined();
  });
});

// ─── 3. capability_missing ───────────────────────────────────────────────────

describe("handleExternalRequest — capability_missing", () => {
  beforeEach(() => { process.env.MCP_WRITE_ENABLED = "true"; });
  afterEach(() => { delete process.env.MCP_WRITE_ENABLED; jest.clearAllMocks(); });

  it("retorna 403 quando API key não tem capability para a write tool", async () => {
    const apiKey = createApiKeyCtx({ read: ["crm"], write: {} }); // sem write
    const writeTool = makeWriteTool("crm.res_partner.create", "crm", "create");
    const deps = makeDeps({ catalog: [writeTool] as ReadonlyArray<ToolEntry | WriteToolEntry> });

    const { req, bodyBuffer } = makeRequest(
      "POST",
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "crm.res_partner.create", arguments: { name: "X" } } },
      { "idempotency-key": "idem-002" },
    );

    const result = await handleExternalRequest(req, bodyBuffer, apiKey, deps);

    expect(result.status).toBe(403);
    const body = JSON.parse(result.body) as { result: { isError: boolean; content: Array<{ text: string }> } };
    expect(body.result.isError).toBe(true);
    const content = JSON.parse(body.result.content[0].text) as { error: string };
    expect(content.error).toMatch(/capability_missing/);
  });
});

// ─── 4. Kill switch → 503 ───────────────────────────────────────────────────

describe("handleExternalRequest — kill switch MCP_WRITE_ENABLED=false", () => {
  beforeEach(() => { delete process.env.MCP_WRITE_ENABLED; });
  afterEach(() => { jest.clearAllMocks(); });

  it("retorna 503 feature_disabled quando MCP_WRITE_ENABLED não está 'true'", async () => {
    const apiKey = createApiKeyCtx({ write: { crm: ["create"] }, capabilitiesVersion: 1 });
    const writeTool = makeWriteTool("crm.res_partner.create", "crm", "create");
    const deps = makeDeps({ catalog: [writeTool] as ReadonlyArray<ToolEntry | WriteToolEntry> });

    const { req, bodyBuffer } = makeRequest(
      "POST",
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "crm.res_partner.create", arguments: { name: "X" } } },
      { "idempotency-key": "idem-003" },
    );

    const result = await handleExternalRequest(req, bodyBuffer, apiKey, deps);

    expect(result.status).toBe(503);
    const body = JSON.parse(result.body) as { result: { content: Array<{ text: string }> } };
    const content = JSON.parse(body.result.content[0].text) as { error: string };
    expect(content.error).toBe("feature_disabled");
  });
});

// ─── 5. Idempotency — key required ──────────────────────────────────────────

describe("handleExternalRequest — idempotency key required", () => {
  beforeEach(() => { process.env.MCP_WRITE_ENABLED = "true"; });
  afterEach(() => { delete process.env.MCP_WRITE_ENABLED; jest.clearAllMocks(); });

  it("retorna 400 idempotency_key_required quando header ausente em write", async () => {
    const apiKey = createApiKeyCtx({ write: { crm: ["create"] }, capabilitiesVersion: 1 });
    const writeTool = makeWriteTool("crm.res_partner.create", "crm", "create");
    const deps = makeDeps({ catalog: [writeTool] as ReadonlyArray<ToolEntry | WriteToolEntry> });

    // Sem idempotency-key no header
    const { req, bodyBuffer } = makeRequest(
      "POST",
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "crm.res_partner.create", arguments: { name: "X" } } },
    );

    const result = await handleExternalRequest(req, bodyBuffer, apiKey, deps);

    expect(result.status).toBe(400);
    const body = JSON.parse(result.body) as { result: { content: Array<{ text: string }>; isError: boolean } };
    expect(body.result.isError).toBe(true);
    const content = JSON.parse(body.result.content[0].text) as { error: string };
    expect(content.error).toBe("idempotency_key_required");
  });
});

// ─── 6. Idempotency cached ───────────────────────────────────────────────────

describe("handleExternalRequest — idempotency cached", () => {
  beforeEach(() => { process.env.MCP_WRITE_ENABLED = "true"; });
  afterEach(() => { delete process.env.MCP_WRITE_ENABLED; jest.clearAllMocks(); });

  it("retorna resultado cacheado sem chamar o handler quando já existe record", async () => {
    const apiKey: ApiKeyContext = {
      ...createApiKeyCtx({ write: { crm: ["create"] }, capabilitiesVersion: 1 }),
      apiKeyId: "idem-cache-test-key",
    };
    const writeTool = makeWriteTool("crm.res_partner.create", "crm", "create");

    const cachedData = { id: 99, name: "Cached Partner" };
    const payloadHash = (await import("../../lib/canonical-json.js")).canonicalHash({ name: "X" });

    const prismaInst = mockPrisma({
      mcpIdempotencyRecord: {
        findUnique: jest.fn().mockResolvedValue({
          apiKeyId: apiKey.apiKeyId,
          key: "idem-cached-001",
          toolId: writeTool.id,
          payloadHash,
          result: cachedData,
          httpStatus: 200,
          status: "success",
          expiresAt: new Date(Date.now() + 3600_000),
        }),
        create: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
    });
    (prismaInst.mcpAuditLog.createMany as jest.Mock).mockResolvedValue({ count: 1 });

    const deps = makeDeps({
      catalog: [writeTool] as ReadonlyArray<ToolEntry | WriteToolEntry>,
      prismaOverrides: {},
    });
    // Override prisma after creation to use the one with the cached record
    (deps as { prisma: PrismaClient }).prisma = prismaInst as unknown as PrismaClient;

    // Primeiro, "use" o lock via redis para forçar o caminho de cache.
    // Mais simples: mockar checkIdempotency diretamente não é feito aqui
    // para manter o teste realista. Usamos o redis real (ioredis-mock) e
    // simulamos que o lock já está adquirido por outro processo, então
    // checkIdempotency encontra o record.
    const redis = deps.redis;
    // Adquirir o lock manualmente para simular "lock em posse de outro"
    await redis.set(`mcp:idem:${apiKey.apiKeyId}:idem-cached-001`, "1", "EX", 60, "NX");

    const { req, bodyBuffer } = makeRequest(
      "POST",
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "crm.res_partner.create", arguments: { name: "X" } } },
      { "idempotency-key": "idem-cached-001" },
    );

    const result = await handleExternalRequest(req, bodyBuffer, apiKey, deps);

    expect(result.status).toBe(200);
    const body = JSON.parse(result.body) as { result: { isError: boolean; content: Array<{ text: string }> } };
    expect(body.result.isError).toBe(false);
    // handler NÃO deve ter sido chamado
    expect(writeTool.handler).not.toHaveBeenCalled();
    // conteúdo deve ser o resultado cacheado
    const content = JSON.parse(body.result.content[0].text) as unknown;
    expect(content).toEqual(cachedData);
  });
});

// ─── 7. Rate limit ───────────────────────────────────────────────────────────

describe("handleExternalRequest — rate limit excedido", () => {
  afterEach(() => jest.clearAllMocks());

  it("retorna 429 quando rate limit excedido", async () => {
    // Usar apiKeyId único para não vazar estado entre testes com ioredis-mock
    const apiKey: ApiKeyContext = {
      ...createApiKeyCtx({ read: ["crm"] }),
      apiKeyId: "ratelimit-test-only-key",
      rateLimit: 1,
    };

    const readTool = makeReadTool("crm.res_partner.get", "crm");
    const redis = createMockRedis();

    // Esgotar o rate limit manualmente: definir contador acima do limite
    await redis.set(`mcp:rate:apikey:${apiKey.apiKeyId}`, "999", "EX", 60);

    const deps: ExternalPipelineDeps = {
      prisma: mockPrisma() as unknown as PrismaClient,
      redis,
      catalog: [readTool] as ReadonlyArray<ToolEntry | WriteToolEntry>,
    };

    const { req, bodyBuffer } = makeRequest(
      "POST",
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "crm.res_partner.get", arguments: {} } },
    );

    const result = await handleExternalRequest(req, bodyBuffer, apiKey, deps);

    expect(result.status).toBe(429);
    expect(result.headers["X-RateLimit-Limit"]).toBeDefined();
  });
});

// ─── 8. tools/call read — sucesso ────────────────────────────────────────────

describe("handleExternalRequest — tools/call read sucesso", () => {
  afterEach(() => jest.clearAllMocks());

  it("retorna output do handler de leitura sem idempotency", async () => {
    const apiKey = createApiKeyCtx({ read: ["crm"] });
    const readTool = makeReadTool("crm.res_partner.get", "crm", { id: 1, name: "Partner" });
    const deps = makeDeps({ catalog: [readTool] as ReadonlyArray<ToolEntry | WriteToolEntry> });

    const { req, bodyBuffer } = makeRequest(
      "POST",
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "crm.res_partner.get", arguments: { q: "test" } } },
    );

    const result = await handleExternalRequest(req, bodyBuffer, apiKey, deps);

    expect(result.status).toBe(200);
    const body = JSON.parse(result.body) as { result: { isError: boolean; content: Array<{ text: string }> } };
    expect(body.result.isError).toBe(false);
    const content = JSON.parse(body.result.content[0].text) as { id: number; name: string };
    expect(content.id).toBe(1);
    expect(content.name).toBe("Partner");
  });

  it("retorna 404-style isError para tool não encontrada", async () => {
    const apiKey = createApiKeyCtx({ read: ["crm"] });
    const deps = makeDeps({ catalog: [] });

    const { req, bodyBuffer } = makeRequest(
      "POST",
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "nao.existe", arguments: {} } },
    );

    const result = await handleExternalRequest(req, bodyBuffer, apiKey, deps);

    expect(result.status).toBe(200); // MCP retorna 200 com isError=true para tool_not_found
    const body = JSON.parse(result.body) as { result: { isError: boolean } };
    expect(body.result.isError).toBe(true);
  });

  it("retorna tools/list corretamente via handleExternalRequest", async () => {
    const apiKey = createApiKeyCtx({ read: ["crm"] });
    const readTool = makeReadTool("crm.res_partner.get", "crm");
    const deps = makeDeps({ catalog: [readTool] as ReadonlyArray<ToolEntry | WriteToolEntry> });

    const { req, bodyBuffer } = makeRequest(
      "POST",
      { jsonrpc: "2.0", id: 4, method: "tools/list" },
    );

    const result = await handleExternalRequest(req, bodyBuffer, apiKey, deps);

    expect(result.status).toBe(200);
    const body = JSON.parse(result.body) as { result: { tools: Array<{ name: string }> } };
    expect(body.result.tools.map((t) => t.name)).toContain("crm.res_partner.get");
  });
});
