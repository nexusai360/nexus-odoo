// mcp/__tests__/integration.test.ts
// Harness de teste de integração do MCP — 4f-4.
//
// Cobre:
//   1. Assertiva de catálogo: super_admin recebe EXATAMENTE 25 tools com os IDs corretos (N6).
//   2. Catálogo filtrado por perfil: cada role recebe o subconjunto correto.
//   3. bi_consulta_avancada só para super_admin e admin.
//   4. registrar_lacuna sempre visível (sempreVisivel).
//   5. Servidor HTTP real: initialize + tools/list via protocolo Streamable HTTP.
//   6. Tool de domínio negado → denied no pipeline (handleToolCall).
//   7. Input inválido → erro estruturado (Zod).
//
// Mock strategy:
//   - validateServiceToken: aceita TEST_SERVICE_TOKEN
//   - resolveUserContext: retorna UserContext fixo por userId (sem banco)
//   - prisma: mock mínimo para handleToolCall (resolveUser injeta o contexto)
//   - mcpRedis: pipeline mock que sempre retorna count=1 (sem Redis real)
//   - catalogo: REAL (as 25 tools de produção — objetivo da rede N6)

// ─── Mocks configurados ANTES dos imports de implementação ────────────────────

jest.mock("../auth/service-token.js", () => ({
  validateServiceToken: jest.fn((auth: string | undefined) =>
    auth === `Bearer test-service-token-integration`
  ),
}));

// resolveUserContext retorna o perfil pelo userId (mapa estático)
jest.mock("../auth/user-context.js", () => ({
  resolveUserContext: jest.fn(async (_prisma: unknown, userId: string) => {
    const map: Record<string, object> = {
      "user-super-admin": { userId: "user-super-admin", role: "super_admin", domains: ["estoque", "financeiro"] },
      "user-admin":       { userId: "user-admin",       role: "admin",       domains: ["estoque", "financeiro"] },
      "user-manager":     { userId: "user-manager",     role: "manager",     domains: ["estoque", "financeiro"] },
      "user-viewer":      { userId: "user-viewer",      role: "viewer",      domains: ["estoque"] },
      "user-viewer-fin":  { userId: "user-viewer-fin",  role: "viewer",      domains: ["financeiro"] },
      "user-viewer-none": { userId: "user-viewer-none", role: "viewer",      domains: [] },
    };
    return map[userId] ?? null;
  }),
}));

jest.mock("../auth/session-store.js", () => ({
  sessionStore: { set: jest.fn(), get: jest.fn(), delete: jest.fn() },
}));

jest.mock("../lib/prisma.js", () => ({
  prisma: {
    mcpAuditLog: { create: jest.fn().mockResolvedValue({}) },
    featureRequest: { create: jest.fn().mockResolvedValue({ id: "fr-1" }) },
  },
}));

// Rate limiter: sempre permite (count=1)
jest.mock("../lib/redis.js", () => ({
  mcpRedis: {
    pipeline: jest.fn().mockReturnValue({
      incr: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([[null, 1], [null, 1]]),
    }),
  },
}));

// NÃO mockar o catálogo — usamos o catálogo REAL (rede de proteção N6 — 25 tools)

// ─── Imports pós-mock ─────────────────────────────────────────────────────────
import { catalogo } from "../catalog/index.js";
import { visibleTools } from "../catalog/registry.js";
import { handleToolCall } from "../server.js";
import { startTestServer, mcpRequest, TEST_SERVICE_TOKEN, resetRpcId, nextRpcId, type TestServer } from "./harness.js";

// ─── Constantes de IDs esperados ──────────────────────────────────────────────

const ESTOQUE_IDS = [
  "estoque_saldo_produto",
  "estoque_valor_armazem",
  "estoque_entradas_saidas",
  "estoque_top_movimentados",
  "estoque_produtos_parados",
  "estoque_concentracao",
];

const FINANCEIRO_IDS = [
  "financeiro_saldo_contas",
  "financeiro_caixa_periodo",
  "financeiro_fluxo_caixa",
  "financeiro_contas_a_receber",
  "financeiro_contas_a_pagar",
  "financeiro_titulos_vencidos",
];

const COMERCIAL_IDS = [
  "comercial_pedidos_periodo",
  "comercial_pedidos_por_etapa",
  "comercial_pedidos_por_vendedor",
  "comercial_pedidos_atrasados",
  "comercial_parcelas_a_vencer",
];

const FISCAL_IDS = [
  "fiscal_faturamento_periodo",
  "fiscal_notas_emitidas",
  "fiscal_notas_recebidas",
  "fiscal_impostos_periodo",
  "fiscal_faturamento_por_cliente",
  "fiscal_produtos_faturados",
];

const TODOS_IDS = [
  ...ESTOQUE_IDS,
  ...FINANCEIRO_IDS,
  ...COMERCIAL_IDS,
  ...FISCAL_IDS,
  "registrar_lacuna",
  "bi_consulta_avancada",
];

// ─── 1. Assertiva de catálogo completo (achado N6) ────────────────────────────

describe("Catálogo completo — rede de proteção N6", () => {
  it("super_admin recebe EXATAMENTE 25 tools", () => {
    const user = { userId: "u", role: "super_admin" as const, domains: ["estoque", "financeiro"] } as unknown as Parameters<typeof visibleTools>[1];
    const tools = visibleTools(catalogo, user);
    expect(tools).toHaveLength(25);
  });

  it("super_admin recebe o conjunto exato de IDs", () => {
    const user = { userId: "u", role: "super_admin" as const, domains: ["estoque", "financeiro"] } as unknown as Parameters<typeof visibleTools>[1];
    const tools = visibleTools(catalogo, user);
    const ids = tools.map((t) => t.id).sort();
    expect(ids).toEqual([...TODOS_IDS].sort());
  });

  it("catálogo bruto (antes do filtro) tem exatamente 25 entradas", () => {
    expect(catalogo).toHaveLength(25);
  });
});

// ─── 2. Catálogo filtrado por perfil ─────────────────────────────────────────

describe("Catálogo filtrado por perfil", () => {
  function tools(role: string, domains: string[]) {
    const user = { userId: "u", role, domains } as Parameters<typeof visibleTools>[1];
    return visibleTools(catalogo, user).map((t) => t.id);
  }

  it("super_admin vê todas as 25 tools", () => {
    const ids = tools("super_admin", ["estoque", "financeiro"]);
    expect(ids).toHaveLength(25);
    for (const id of TODOS_IDS) {
      expect(ids).toContain(id);
    }
  });

  it("admin vê todas as 25 tools", () => {
    const ids = tools("admin", ["estoque", "financeiro"]);
    expect(ids).toHaveLength(25);
  });

  it("manager com estoque+financeiro vê estoque+financeiro+registrar_lacuna (sem bi_consulta_avancada)", () => {
    const ids = tools("manager", ["estoque", "financeiro"]);
    expect(ids).toContain("registrar_lacuna");
    expect(ids).not.toContain("bi_consulta_avancada");
    for (const id of ESTOQUE_IDS) expect(ids).toContain(id);
    for (const id of FINANCEIRO_IDS) expect(ids).toContain(id);
    // 6 estoque + 6 financeiro + registrar_lacuna = 13
    expect(ids).toHaveLength(13);
  });

  it("viewer com apenas estoque vê só tools de estoque + registrar_lacuna", () => {
    const ids = tools("viewer", ["estoque"]);
    expect(ids).toContain("registrar_lacuna");
    expect(ids).not.toContain("bi_consulta_avancada");
    for (const id of ESTOQUE_IDS) expect(ids).toContain(id);
    for (const id of FINANCEIRO_IDS) expect(ids).not.toContain(id);
    // 6 estoque + registrar_lacuna = 7
    expect(ids).toHaveLength(7);
  });

  it("viewer com apenas financeiro vê só tools de financeiro + registrar_lacuna", () => {
    const ids = tools("viewer", ["financeiro"]);
    expect(ids).toContain("registrar_lacuna");
    expect(ids).not.toContain("bi_consulta_avancada");
    for (const id of FINANCEIRO_IDS) expect(ids).toContain(id);
    for (const id of ESTOQUE_IDS) expect(ids).not.toContain(id);
    expect(ids).toHaveLength(7);
  });

  it("viewer sem domínio vê apenas registrar_lacuna", () => {
    const ids = tools("viewer", []);
    expect(ids).toEqual(["registrar_lacuna"]);
  });

  // ─── Onda B: comercial — assertivas de perfil (R2-I1) ────────────────────────
  // Usa apenas perfis existentes no fixture (não estende o mapa de mocks).

  it("admin vê as 5 tools de comercial (RBAC camada 1 — vê tudo)", () => {
    const ids = tools("admin", ["estoque", "financeiro"]);
    for (const id of COMERCIAL_IDS) {
      expect(ids).toContain(id);
    }
  });

  it("viewer com apenas estoque NÃO vê as tools de comercial", () => {
    const ids = tools("viewer", ["estoque"]);
    for (const id of COMERCIAL_IDS) {
      expect(ids).not.toContain(id);
    }
  });
});

// ─── 3. bi_consulta_avancada — gate de role ───────────────────────────────────

describe("bi_consulta_avancada — gate de role", () => {
  const biTool = catalogo.find((t) => t.id === "bi_consulta_avancada");

  it("bi_consulta_avancada existe no catálogo", () => {
    expect(biTool).toBeDefined();
  });

  it("bi_consulta_avancada tem gatedRoles = [super_admin, admin]", () => {
    expect(biTool?.gatedRoles).toEqual(expect.arrayContaining(["super_admin", "admin"]));
    expect(biTool?.gatedRoles).toHaveLength(2);
  });

  it.each(["super_admin", "admin"])("%s pode ver bi_consulta_avancada", (role) => {
    const user = { userId: "u", role, domains: ["estoque", "financeiro"] } as Parameters<typeof visibleTools>[1];
    const ids = visibleTools(catalogo, user).map((t) => t.id);
    expect(ids).toContain("bi_consulta_avancada");
  });

  it.each(["manager", "viewer"])("%s NÃO pode ver bi_consulta_avancada", (role) => {
    const user = { userId: "u", role, domains: ["estoque", "financeiro"] } as Parameters<typeof visibleTools>[1];
    const ids = visibleTools(catalogo, user).map((t) => t.id);
    expect(ids).not.toContain("bi_consulta_avancada");
  });
});

// ─── 4. registrar_lacuna — sempreVisivel ──────────────────────────────────────

describe("registrar_lacuna — sempreVisivel", () => {
  const lacunaTool = catalogo.find((t) => t.id === "registrar_lacuna");

  it("registrar_lacuna existe no catálogo", () => {
    expect(lacunaTool).toBeDefined();
  });

  it("registrar_lacuna tem sempreVisivel=true", () => {
    expect(lacunaTool?.sempreVisivel).toBe(true);
  });

  it.each(["super_admin", "admin", "manager", "viewer"])("%s com domínio vazio ainda vê registrar_lacuna", (role) => {
    const user = { userId: "u", role, domains: [] } as Parameters<typeof visibleTools>[1];
    const ids = visibleTools(catalogo, user).map((t) => t.id);
    expect(ids).toContain("registrar_lacuna");
  });
});

// ─── 5. Servidor HTTP real — protocolo Streamable HTTP end-to-end ────────────
//
// Exercita a cadeia completa: initialize → captura mcp-session-id → tools/list
// → tools/call, tudo passando pelo StreamableHTTPServerTransport real.
// Verifica que o catálogo filtrado por perfil e o gate de 3c funcionam ponta a ponta.

/** Extrai o result de um body JSON-RPC (pode vir como JSON direto ou SSE). */
function extractRpcResult(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Record<string, unknown>;
  return b.result as Record<string, unknown> | undefined;
}

/**
 * Faz initialize via HTTP e retorna o mcp-session-id emitido pelo servidor.
 * Falha o teste se o sessionId não estiver presente no cabeçalho de resposta.
 */
async function initializeSession(baseUrl: string, userId: string): Promise<string> {
  const { status, body, sessionId } = await mcpRequest(
    baseUrl,
    {
      jsonrpc: "2.0",
      id: nextRpcId(),
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        clientInfo: { name: "nexus-test-harness", version: "1.0" },
        capabilities: {},
      },
    },
    userId,
  );

  expect(status).toBe(200);
  const result = extractRpcResult(body);
  expect(result?.serverInfo).toBeDefined();

  // O SDK Streamable HTTP stateful SEMPRE emite mcp-session-id no cabeçalho do initialize.
  expect(sessionId).toBeDefined();
  return sessionId!;
}

describe("Servidor HTTP real — protocolo Streamable HTTP end-to-end", () => {
  let testServer: TestServer;

  beforeAll(async () => {
    resetRpcId();
    testServer = await startTestServer();
  });

  afterAll(async () => {
    await testServer.stop();
  });

  // ── 5a. Handshake básico ───────────────────────────────────────────────────

  it("initialize retorna serverInfo e mcp-session-id no cabeçalho", async () => {
    await initializeSession(testServer.baseUrl, "user-super-admin");
  });

  it("token inválido retorna 401", async () => {
    const { status } = await fetch(`${testServer.baseUrl}/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer wrong-token",
        "x-mcp-user-id": "user-super-admin",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", clientInfo: { name: "t", version: "1" }, capabilities: {} } }),
    });
    expect(status).toBe(401);
  });

  it("userId desconhecido retorna 403", async () => {
    const { status } = await fetch(`${testServer.baseUrl}/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${TEST_SERVICE_TOKEN}`,
        "x-mcp-user-id": "user-desconhecido",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", clientInfo: { name: "t", version: "1" }, capabilities: {} } }),
    });
    expect(status).toBe(403);
  });

  // ── 5b. tools/list via HTTP — catálogo filtrado por perfil ────────────────

  it("super_admin: tools/list via HTTP retorna 25 tools com os IDs corretos", async () => {
    const sid = await initializeSession(testServer.baseUrl, "user-super-admin");

    const { status, body } = await mcpRequest(
      testServer.baseUrl,
      { jsonrpc: "2.0", id: nextRpcId(), method: "tools/list", params: {} },
      "user-super-admin",
      sid,
    );

    expect(status).toBe(200);
    const result = extractRpcResult(body);
    const tools = result?.tools as Array<{ name: string }> | undefined;
    expect(tools).toBeDefined();
    expect(tools!).toHaveLength(25);

    const names = tools!.map((t) => t.name).sort();
    expect(names).toEqual([...TODOS_IDS].sort());
  });

  it("manager: tools/list via HTTP não inclui bi_consulta_avancada", async () => {
    const sid = await initializeSession(testServer.baseUrl, "user-manager");

    const { status, body } = await mcpRequest(
      testServer.baseUrl,
      { jsonrpc: "2.0", id: nextRpcId(), method: "tools/list", params: {} },
      "user-manager",
      sid,
    );

    expect(status).toBe(200);
    const result = extractRpcResult(body);
    const tools = result?.tools as Array<{ name: string }> | undefined;
    expect(tools).toBeDefined();
    const names = tools!.map((t) => t.name);
    expect(names).not.toContain("bi_consulta_avancada");
    expect(names).toContain("registrar_lacuna");
    // 6 estoque + 6 financeiro + registrar_lacuna = 13
    expect(names).toHaveLength(13);
  });

  it("viewer (estoque): tools/list via HTTP retorna só estoque + registrar_lacuna", async () => {
    const sid = await initializeSession(testServer.baseUrl, "user-viewer");

    const { status, body } = await mcpRequest(
      testServer.baseUrl,
      { jsonrpc: "2.0", id: nextRpcId(), method: "tools/list", params: {} },
      "user-viewer",
      sid,
    );

    expect(status).toBe(200);
    const result = extractRpcResult(body);
    const tools = result?.tools as Array<{ name: string }> | undefined;
    expect(tools).toBeDefined();
    const names = tools!.map((t) => t.name);
    // 6 estoque + registrar_lacuna = 7; sem bi_consulta_avancada, sem financeiro
    expect(names).toHaveLength(7);
    expect(names).toContain("registrar_lacuna");
    expect(names).not.toContain("bi_consulta_avancada");
    for (const id of FINANCEIRO_IDS) expect(names).not.toContain(id);
    for (const id of ESTOQUE_IDS) expect(names).toContain(id);
  });

  // ── 5c. tools/call via HTTP — um por domínio + gate 3c + registrar_lacuna ──

  it("super_admin: tools/call registrar_lacuna via HTTP retorna resultado sem isError", async () => {
    const sid = await initializeSession(testServer.baseUrl, "user-super-admin");

    const { status, body } = await mcpRequest(
      testServer.baseUrl,
      {
        jsonrpc: "2.0",
        id: nextRpcId(),
        method: "tools/call",
        params: {
          name: "registrar_lacuna",
          arguments: { perguntaResumo: "Qual a margem por produto?", dominio: "financeiro" },
        },
      },
      "user-super-admin",
      sid,
    );

    expect(status).toBe(200);
    const result = extractRpcResult(body);
    // MCP empacota o resultado em result.content[0].text (JSON stringificado)
    const content = result?.content as Array<{ type: string; text: string }> | undefined;
    expect(content).toBeDefined();
    expect(content![0]?.type).toBe("text");
    // Sem isError = sucesso
    expect(result?.isError).toBeFalsy();
  });

  it("admin: tools/call bi_consulta_avancada via HTTP retorna stub (disponivel=false)", async () => {
    const sid = await initializeSession(testServer.baseUrl, "user-admin");

    const { status, body } = await mcpRequest(
      testServer.baseUrl,
      {
        jsonrpc: "2.0",
        id: nextRpcId(),
        method: "tools/call",
        params: {
          name: "bi_consulta_avancada",
          arguments: { pergunta: "Liste os 10 produtos mais rentáveis" },
        },
      },
      "user-admin",
      sid,
    );

    expect(status).toBe(200);
    const result = extractRpcResult(body);
    const content = result?.content as Array<{ type: string; text: string }> | undefined;
    expect(content).toBeDefined();
    // Stub retorna disponivel=false — parse do JSON no text
    const payload = JSON.parse(content![0]?.text ?? "{}") as Record<string, unknown>;
    expect(payload.disponivel).toBe(false);
    expect(result?.isError).toBeFalsy();
  });

  it("manager: tools/call bi_consulta_avancada via HTTP retorna erro (gate de role ponta a ponta)", async () => {
    // manager não vê bi_consulta_avancada no catálogo, mas mesmo que tente chamar via HTTP
    // diretamente, o pipeline handleToolCall nega via assertToolAllowed (camada 2).
    const sid = await initializeSession(testServer.baseUrl, "user-manager");

    const { status, body } = await mcpRequest(
      testServer.baseUrl,
      {
        jsonrpc: "2.0",
        id: nextRpcId(),
        method: "tools/call",
        params: {
          name: "bi_consulta_avancada",
          arguments: { pergunta: "query" },
        },
      },
      "user-manager",
      sid,
    );

    // O SDK responde 200 com isError=true no MCP (erros de tool não são HTTP 4xx)
    // OU 404 se a tool não estiver registrada nesta sessão (catálogo filtrado).
    // Ambos são comportamentos corretos — o que importa é que manager não executa a tool.
    const result = extractRpcResult(body);
    const isToolError = result?.isError === true;
    const isHttpNotFound = status === 404;
    const isJsonRpcError = !!(body as Record<string, unknown>)?.error;
    expect(isToolError || isHttpNotFound || isJsonRpcError).toBe(true);
  });

  it("viewer (estoque): tools/call tool financeira via HTTP é negado ponta a ponta", async () => {
    const sid = await initializeSession(testServer.baseUrl, "user-viewer");

    const { status, body } = await mcpRequest(
      testServer.baseUrl,
      {
        jsonrpc: "2.0",
        id: nextRpcId(),
        method: "tools/call",
        params: {
          name: "financeiro_saldo_contas",
          arguments: {},
        },
      },
      "user-viewer",
      sid,
    );

    // Tool não registrada na sessão → SDK retorna erro JSON-RPC; ou pipeline nega com isError.
    const result = extractRpcResult(body);
    const isToolError = result?.isError === true;
    const isHttpNotFound = status === 404;
    const isJsonRpcError = !!(body as Record<string, unknown>)?.error;
    expect(isToolError || isHttpNotFound || isJsonRpcError).toBe(true);
  });
});

// ─── 6. Pipeline handleToolCall — domínio negado → denied ─────────────────────

describe("handleToolCall — domínio negado retorna denied", () => {
  it("viewer de estoque não pode chamar tool financeira", async () => {
    const finTool = catalogo.find((t) => t.id === "financeiro_saldo_contas");
    expect(finTool).toBeDefined();

    const result = await handleToolCall(
      finTool!,
      {},
      "user-viewer", // só tem domínio estoque
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/denied|acesso negado/i);
  });

  it("manager não pode chamar bi_consulta_avancada (gate de role)", async () => {
    const biTool = catalogo.find((t) => t.id === "bi_consulta_avancada");
    expect(biTool).toBeDefined();

    const result = await handleToolCall(
      biTool!,
      { sql: "SELECT 1" },
      "user-manager",
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/denied|acesso negado/i);
  });
});

// ─── 7. Pipeline handleToolCall — input inválido → erro estruturado ───────────

describe("handleToolCall — input inválido retorna erro estruturado", () => {
  it("bi_consulta_avancada com pergunta vazia retorna isError=true", async () => {
    // bi_consulta_avancada exige pergunta: z.string().min(1) — string vazia é inválida
    const tool = catalogo.find((t) => t.id === "bi_consulta_avancada");
    expect(tool).toBeDefined();

    const result = await handleToolCall(
      tool!,
      { pergunta: "" }, // min(1) rejeita string vazia
      "user-super-admin",
    );

    expect(result.isError).toBe(true);
  });

  it("bi_consulta_avancada sem campo 'pergunta' retorna isError=true", async () => {
    const tool = catalogo.find((t) => t.id === "bi_consulta_avancada");
    expect(tool).toBeDefined();

    const result = await handleToolCall(
      tool!,
      {}, // campo obrigatório ausente
      "user-super-admin",
    );

    expect(result.isError).toBe(true);
  });
});
