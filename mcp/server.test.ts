// mcp/server.test.ts
import * as http from "node:http";
import { createHttpServer, visibleTools } from "./server.js";
import type { PrismaClient } from "@/generated/prisma/client";
import { z } from "zod";
import type { ToolEntry } from "./catalog/types.js";
import type { UserContext } from "./auth/user-context.js";

// Mock do validateServiceToken
jest.mock("./auth/service-token.js", () => ({
  validateServiceToken: jest.fn(),
}));
// Mock do resolveUserContext
jest.mock("./auth/user-context.js", () => ({
  resolveUserContext: jest.fn(),
}));
// Mock do sessionStore
jest.mock("./auth/session-store.js", () => ({
  sessionStore: { set: jest.fn(), get: jest.fn(), delete: jest.fn() },
}));
// Mock do prisma
jest.mock("./lib/prisma.js", () => ({
  prisma: {} as PrismaClient,
}));
// Mock do catalogo — padrão vazio (testes de middleware).
// Testes de sessão usam jest.spyOn no módulo para substituir o catálogo.
jest.mock("./catalog/index.js", () => ({
  catalogo: [],
}));

// Mock do StreamableHTTPServerTransport — captura as opções do construtor
// para que os testes de sessão possam disparar onsessioninitialized manualmente.
// Cada instância gerada pelo mock armazena suas opções e expõe mockSessionId.
const transportInstances: Array<{
  options: { sessionIdGenerator?: () => string; onsessioninitialized?: (sid: string) => void };
  mockSessionId: string | undefined;
  onclose?: () => void;
  handleRequest: jest.Mock;
}> = [];

jest.mock("@modelcontextprotocol/sdk/server/streamableHttp.js", () => {
  return {
    StreamableHTTPServerTransport: jest.fn().mockImplementation((options: Record<string, unknown>) => {
      const raw = {
        options: options as { sessionIdGenerator?: () => string; onsessioninitialized?: (sid: string) => void },
        mockSessionId: undefined as string | undefined,
        onclose: undefined as (() => void) | undefined,
        handleRequest: jest.fn().mockResolvedValue(undefined),
        start: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
        send: jest.fn().mockResolvedValue(undefined),
      };
      // sessionId precisa de getter para refletir mockSessionId após atribuição
      Object.defineProperty(raw, "sessionId", {
        get() { return this.mockSessionId; },
        configurable: true,
      });
      const instance = raw as (typeof transportInstances)[number];
      transportInstances.push(instance);
      return instance;
    }),
  };
});

import { validateServiceToken } from "./auth/service-token.js";
import { resolveUserContext } from "./auth/user-context.js";
import { sessionStore } from "./auth/session-store.js";

const mockValidateToken = validateServiceToken as jest.MockedFunction<typeof validateServiceToken>;
const mockResolveUser = resolveUserContext as jest.MockedFunction<typeof resolveUserContext>;
const mockSessionStore = sessionStore as { set: jest.Mock; delete: jest.Mock; get: jest.Mock };

function makeRequest(headers: Record<string, string> = {}): http.IncomingMessage {
  const req = new http.IncomingMessage(null as never);
  Object.assign(req, { headers, url: "/mcp", method: "POST" });
  return req;
}

function makeResponse(): http.ServerResponse & { _statusCode?: number; _ended?: boolean } {
  const res = Object.assign(new http.ServerResponse(makeRequest()), {
    _statusCode: 200,
    _ended: false,
    writeHead(code: number) {
      this._statusCode = code;
      return this;
    },
    end() {
      this._ended = true;
      return this;
    },
  });
  return res;
}

describe("createHttpServer — middleware de service token (4a.14)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    transportInstances.length = 0;
  });

  it("retorna 401 para request sem Authorization", async () => {
    mockValidateToken.mockReturnValue(false);
    const server = createHttpServer();
    const req = makeRequest({});
    const res = makeResponse();
    // Acessa o handler interno do servidor
    await (server as unknown as { _handler: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> })._handler(req, res);
    expect(res._statusCode).toBe(401);
    expect(res._ended).toBe(true);
  });

  it("retorna 401 para token inválido", async () => {
    mockValidateToken.mockReturnValue(false);
    const server = createHttpServer();
    const req = makeRequest({ authorization: "Bearer wrong" });
    const res = makeResponse();
    await (server as unknown as { _handler: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> })._handler(req, res);
    expect(res._statusCode).toBe(401);
  });

  it("chama o próximo middleware com token válido", async () => {
    mockValidateToken.mockReturnValue(true);
    mockResolveUser.mockResolvedValue(null); // resultará em 403 no próximo middleware
    const server = createHttpServer();
    const req = makeRequest({ authorization: "Bearer valid", "x-mcp-user-id": "user-1" });
    const res = makeResponse();
    // Não deve devolver 401
    await (server as unknown as { _handler: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> })._handler(req, res);
    expect(res._statusCode).not.toBe(401);
    expect(mockValidateToken).toHaveBeenCalledWith("Bearer valid");
  });
});

describe("createHttpServer — middleware de sessão (4a.15)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    transportInstances.length = 0;
  });

  it("retorna 403 quando X-Mcp-User-Id ausente", async () => {
    mockValidateToken.mockReturnValue(true);
    const server = createHttpServer();
    const req = makeRequest({ authorization: "Bearer valid" }); // sem x-mcp-user-id
    const res = makeResponse();
    await (server as unknown as { _handler: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> })._handler(req, res);
    expect(res._statusCode).toBe(403);
  });

  it("retorna 403 quando resolveUserContext retorna null", async () => {
    mockValidateToken.mockReturnValue(true);
    mockResolveUser.mockResolvedValue(null);
    const server = createHttpServer();
    const req = makeRequest({ authorization: "Bearer valid", "x-mcp-user-id": "inactive-user" });
    const res = makeResponse();
    await (server as unknown as { _handler: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> })._handler(req, res);
    expect(res._statusCode).toBe(403);
  });
});

// ─── Camada 1 do RBAC — tools/list filtrado por usuário (C1) ─────────────────

function makeTool(
  id: string,
  dominio: ToolEntry["dominio"],
  opts: Partial<Pick<ToolEntry, "gatedRoles" | "sempreVisivel">> = {},
): ToolEntry {
  const schema = z.object({});
  return {
    id,
    dominio,
    descricao: `Tool ${id}`,
    inputSchemaShape: {},
    inputSchema: schema,
    outputSchema: schema,
    handler: async () => ({}),
    ...opts,
  };
}

function makeUser(
  role: UserContext["role"],
  domains: UserContext["domains"],
): UserContext {
  return { userId: "u1", role, domains };
}

describe("visibleTools — camada 1 do RBAC (C1)", () => {
  const estoqueToolA = makeTool("saldo_produto", "estoque");
  const financeiroToolA = makeTool("saldo_contas", "financeiro");
  const gatedTool = makeTool("bi_consulta_avancada", "estoque", {
    gatedRoles: ["super_admin", "admin"],
  });
  const allTools = [estoqueToolA, financeiroToolA, gatedTool];

  it("viewer de estoque recebe apenas tools de estoque em tools/list", () => {
    const user = makeUser("viewer", ["estoque"]);
    const result = visibleTools(allTools, user);
    const ids = result.map((t) => t.id);

    expect(ids).toContain("saldo_produto");
    expect(ids).not.toContain("saldo_contas"); // domínio financeiro — não acessível
  });

  it("viewer de estoque não recebe tool gated (bi_consulta_avancada)", () => {
    const user = makeUser("viewer", ["estoque"]);
    const result = visibleTools(allTools, user);
    const ids = result.map((t) => t.id);

    expect(ids).not.toContain("bi_consulta_avancada");
  });

  it("admin recebe todas as tools incluindo gated e outros domínios", () => {
    const user = makeUser("admin", ["estoque", "financeiro"]);
    const result = visibleTools(allTools, user);
    const ids = result.map((t) => t.id);

    expect(ids).toContain("saldo_produto");
    expect(ids).toContain("saldo_contas");
    expect(ids).toContain("bi_consulta_avancada");
  });

  it("viewer sem nenhum domínio não recebe nenhuma tool de domínio", () => {
    const user = makeUser("viewer", []);
    const result = visibleTools(allTools, user);
    expect(result).toHaveLength(0);
  });
});

// ─── C-NOVO: registro de sessão via onsessioninitialized ──────────────────────
//
// O `StreamableHTTPServerTransport` só atribui `sessionId` ao processar a
// request `initialize` — não imediatamente após `connect()`. A correção usa
// o callback `onsessioninitialized` (opção do construtor) para registrar a
// sessão no momento correto.
//
// Estratégia: o mock acima captura as opções passadas ao construtor em
// `transportInstances`. Os testes disparam `onsessioninitialized` manualmente,
// simulando o que o SDK faz ao processar initialize. Usamos tools reais
// (catálogo não-vazio via mock do catalog/index) para que o código de
// createMcpServerForUser não seja trivialmente pulado — o catálogo vazio
// mascararia o defeito pois visibleTools retornaria [] e nenhum tool seria
// registrado, mas a lógica de registro de sessão ainda rodaria.

/** Tool real com schema não-vazio para simular catálogo de produção. */
function makeRealTool(): ToolEntry {
  const schema = z.object({ produto_id: z.number() });
  return {
    id: "saldo_estoque",
    dominio: "estoque",
    descricao: "Retorna saldo do produto em estoque",
    inputSchemaShape: { produto_id: z.number() },
    inputSchema: schema,
    outputSchema: z.object({ saldo: z.number() }),
    handler: async () => ({ saldo: 42 }),
  };
}

describe("createHttpServer — registro de sessão via onsessioninitialized (C-NOVO)", () => {
  const realTool = makeRealTool();
  const userCtx: UserContext = { userId: "user-123", role: "viewer", domains: ["estoque"] };

  beforeEach(() => {
    jest.clearAllMocks();
    transportInstances.length = 0;

    mockValidateToken.mockReturnValue(true);
    mockResolveUser.mockResolvedValue(userCtx);

    // Sobrescrever catálogo com tool real para que visibleTools retorne algo concreto
    const catalogModule = jest.requireMock("./catalog/index.js") as { catalogo: ToolEntry[] };
    catalogModule.catalogo = [realTool];
  });

  afterEach(() => {
    // Restaurar catálogo vazio para não contaminar outros testes
    const catalogModule = jest.requireMock("./catalog/index.js") as { catalogo: ToolEntry[] };
    catalogModule.catalogo = [];
  });

  it("(a) onsessioninitialized registra sessão em sessionStore", async () => {
    const server = createHttpServer();
    const handler = (server as unknown as { _handler: (r: http.IncomingMessage, s: http.ServerResponse) => Promise<void> })._handler;

    const req = makeRequest({ authorization: "Bearer valid", "x-mcp-user-id": "user-123" });
    const res = makeResponse();

    // Iniciar handler — isso cria o transport via construtor mockado
    const handlerPromise = handler(req, res);

    // Aguardar microtasks para o construtor do transport ser chamado
    await Promise.resolve();

    // Capturar a instância criada pelo construtor
    expect(transportInstances.length).toBeGreaterThan(0);
    const instance = transportInstances[transportInstances.length - 1];

    // Verificar que onsessioninitialized foi passado ao construtor
    expect(instance.options.onsessioninitialized).toBeDefined();

    // Simular o SDK disparando onsessioninitialized ao processar initialize
    const generatedSid = "sess-abc-123";
    instance.mockSessionId = generatedSid;
    instance.options.onsessioninitialized!(generatedSid);

    await handlerPromise;

    // (a) sessionStore.set deve ter sido chamado com o sessionId e userCtx corretos
    expect(mockSessionStore.set).toHaveBeenCalledWith(generatedSid, userCtx);
  });

  it("(b) 2ª request com mesmo mcp-session-id reusa o transport existente (não cria novo)", async () => {
    const server = createHttpServer();
    const handler = (server as unknown as { _handler: (r: http.IncomingMessage, s: http.ServerResponse) => Promise<void> })._handler;

    // 1ª request — sem session-id (nova sessão)
    const req1 = makeRequest({ authorization: "Bearer valid", "x-mcp-user-id": "user-123" });
    const res1 = makeResponse();
    const p1 = handler(req1, res1);
    await Promise.resolve();

    const instance1 = transportInstances[transportInstances.length - 1];
    const sid = "sess-reuse-456";
    instance1.mockSessionId = sid;
    instance1.options.onsessioninitialized!(sid);
    await p1;

    const countAfterFirst = transportInstances.length;

    // 2ª request — com o mesmo mcp-session-id (deve reusar)
    const req2 = makeRequest({
      authorization: "Bearer valid",
      "x-mcp-user-id": "user-123",
      "mcp-session-id": sid,
    });
    const res2 = makeResponse();
    await handler(req2, res2);

    // (b) Não deve ter criado novo transport
    expect(transportInstances.length).toBe(countAfterFirst);
    // O handleRequest do transport original deve ter sido chamado 2 vezes (1ª e 2ª request)
    expect(instance1.handleRequest).toHaveBeenCalledTimes(2);
  });

  it("(c) onclose remove sessão de sessionStore", async () => {
    const server = createHttpServer();
    const handler = (server as unknown as { _handler: (r: http.IncomingMessage, s: http.ServerResponse) => Promise<void> })._handler;

    const req = makeRequest({ authorization: "Bearer valid", "x-mcp-user-id": "user-123" });
    const res = makeResponse();
    const p = handler(req, res);
    await Promise.resolve();

    const instance = transportInstances[transportInstances.length - 1];
    const sid = "sess-close-789";
    instance.mockSessionId = sid;
    instance.options.onsessioninitialized!(sid);
    await p;

    // Disparar onclose — simula fechamento do transport pelo SDK
    instance.onclose?.();

    // (c) sessionStore.delete deve ter sido chamado com o sessionId correto
    expect(mockSessionStore.delete).toHaveBeenCalledWith(sid);
  });
});
