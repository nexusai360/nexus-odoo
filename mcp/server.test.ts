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
// Mock do catalogo
jest.mock("./catalog/index.js", () => ({
  catalogo: [],
}));

import { validateServiceToken } from "./auth/service-token.js";
import { resolveUserContext } from "./auth/user-context.js";

const mockValidateToken = validateServiceToken as jest.MockedFunction<typeof validateServiceToken>;
const mockResolveUser = resolveUserContext as jest.MockedFunction<typeof resolveUserContext>;

function makeRequest(headers: Record<string, string> = {}): http.IncomingMessage {
  const req = new http.IncomingMessage(null as never);
  Object.assign(req, { headers, url: "/mcp", method: "POST" });
  return req;
}

function makeResponse(): http.ServerResponse & { _statusCode?: number; _ended?: boolean } {
  const chunks: Buffer[] = [];
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
