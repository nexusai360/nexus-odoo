// mcp/server.ts
// Servidor HTTP do MCP, middlewares de auth + sessão + McpServer + pipeline de tools/call.
// Decomposto nas tasks 4a.14 (service token) / 4a.15 (sessão) / 4a.16 (transport+McpServer)
// / 4a.17 (pipeline tools/call) / 4f-3 (rate limiter).
//
// NOTA DE ARQUITETURA (Opção A, McpServer por sessão):
// Para implementar a camada 1 do RBAC (tools/list filtrado por usuário), criamos
// um McpServer + StreamableHTTPServerTransport por sessão na requisição `initialize`.
// Cada McpServer registra apenas as tools visíveis ao usuário (visibleTools), garantindo
// que o catálogo filtrado é o que o agente recebe em tools/list.
//
// SDK confirmado: setRequestHandler(ListToolsRequestSchema, ...) é aceito normalmente
// desde que a capability tools esteja registrada (o que McpServer.tool já faz).
// Ver mcp/SDK-NOTES.md para detalhes e teste empírico.
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { validateServiceToken } from "./auth/service-token.js";
import { resolveUserContext, type UserContext } from "./auth/user-context.js";
import { sessionStore } from "./auth/session-store.js";
import { prisma } from "./lib/prisma.js";
import { mcpRedis } from "./lib/redis.js";
import { catalogo } from "./catalog/index.js";
import { visibleTools, assertToolAllowed } from "./catalog/registry.js";
import { recordAudit, extractRowCount, type AuditOutcome } from "./lib/audit.js";
import { toOutcome, safeErrorMessage, describeAuditError } from "./lib/failure.js";
import { checkMcpRateLimit, RATE_LIMIT_EXCEEDED_MESSAGE, type RateLimitRedis } from "./lib/rate-limit.js";
import type { ToolEntry } from "./catalog/types.js";
import { handleHealthRequest } from "./health/index.js";
import { handleCatalogSchemaRequest } from "./catalog/schema-endpoint.js";
import { authenticate, type AuthResult } from "./auth/auth-middleware.js";
import { createApiKeyCache } from "./auth/api-key-cache.js";
import { handlePreflight } from "./middleware/cors.js";
import { handleExternalRequest, type ExternalPipelineDeps } from "./dispatcher/external-pipeline.js";

// ─── handleToolCall, pipeline de tools/call (4a.17) ────────────────────────

export interface HandleToolCallDeps {
  resolveUser: typeof resolveUserContext;
  record: typeof recordAudit;
  rateLimit: RateLimitRedis;
}

/**
 * Pipeline de tools/call com RBAC (camadas 2/6/7), rate limit (camada 7b), validação Zod e audit.
 * Segue a ordem: rate limit → recarregar UserContext → assertToolAllowed → parse input
 *   → executar handler → audit em todos os caminhos.
 *
 * 4f-3: checkMcpRateLimit é executado ANTES de qualquer processamento. Estouro →
 *   outcome=denied + recordAudit + resposta de recusa.
 */
export async function handleToolCall(
  tool: ToolEntry,
  rawInput: unknown,
  userId: string,
  deps: HandleToolCallDeps = { resolveUser: resolveUserContext, record: recordAudit, rateLimit: mcpRedis as RateLimitRedis },
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: true }> {
  const start = Date.now();
  let outcome: AuditOutcome = "error";

  try {
    // Camada 7b (4f-3): rate limit por usuário, antes de qualquer processamento
    const rl = await checkMcpRateLimit(deps.rateLimit, userId);
    if (!rl.allowed) {
      outcome = "denied";
      await auditSafe(deps.record, userId, tool.id, rawInput, outcome, undefined, Date.now() - start, {
        errorCode: "rate_limit_exceeded",
        errorMessage: "Limite de chamadas por minuto da sessão atingido.",
      });
      return errorResult(RATE_LIMIT_EXCEEDED_MESSAGE);
    }

    // Camada 6: recarregar UserContext (proteção contra sessão expirada/revogada)
    const user = await deps.resolveUser(prisma, userId);
    if (!user) {
      outcome = "denied";
      await auditSafe(deps.record, userId, tool.id, rawInput, outcome, undefined, Date.now() - start, {
        errorCode: "denied",
        errorMessage: "Sessão inválida, expirada ou revogada.",
      });
      return errorResult(safeErrorMessage("denied"));
    }

    // Camada 2: gate de autorização
    assertToolAllowed(tool, user);

    // Camada 7: validação Zod do input
    const input = tool.inputSchema.parse(rawInput);

    // Execução do handler
    const output = await tool.handler(input, { prisma, user });
    outcome = "ok";
    const rowCount = extractRowCount(output) ?? undefined;
    await auditSafe(deps.record, userId, tool.id, rawInput, outcome, rowCount, Date.now() - start);

    return { content: [{ type: "text", text: JSON.stringify(output) }] };
  } catch (err: unknown) {
    const errOutcome = toOutcome(err);
    outcome = errOutcome;
    await auditSafe(
      deps.record,
      userId,
      tool.id,
      rawInput,
      outcome,
      undefined,
      Date.now() - start,
      describeAuditError(err),
    );
    return errorResult(safeErrorMessage(errOutcome));
  }
}

async function auditSafe(
  record: typeof recordAudit,
  userId: string,
  tool: string,
  params: unknown,
  outcome: AuditOutcome,
  rowCount: number | undefined,
  durationMs: number,
  errorInfo?: { errorCode?: string; errorMessage?: string },
): Promise<void> {
  try {
    await record(prisma, {
      userId,
      tool,
      params,
      outcome,
      rowCount,
      durationMs,
      errorCode: errorInfo?.errorCode,
      errorMessage: errorInfo?.errorMessage,
    });
  } catch (err: unknown) {
    // Falha de audit NÃO derruba a resposta, mas deve ser visível em produção.
    // SEVERIDADE ALTA: falha sistemática de audit invalida a camada 7 do RBAC.
    // Se este log aparecer com frequência, investigar permissões do role nexus_mcp.
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[mcp] AUDIT_FAILURE", {
      severity: "HIGH",
      userId,
      tool,
      outcome,
      error: msg,
      ts: new Date().toISOString(),
    });
  }
}

function errorResult(message: string): { content: Array<{ type: "text"; text: string }>; isError: true } {
  return { content: [{ type: "text", text: message }], isError: true };
}

// ─── Cache de API keys (singleton por processo) ───────────────────────────────
// Compartilhado entre requests, LRU com TTL de 60s, até 500 entradas.
export const apiKeyCache = createApiKeyCache();

// ─── Registro de McpServer por sessão ────────────────────────────────────────

/**
 * Cria um McpServer e registra apenas as tools visíveis ao usuário (camada 1 do RBAC).
 * Cada sessão tem sua própria instância, tools/list devolve só o catálogo filtrado.
 *
 * C1: visibleTools é chamado aqui, garantindo que o agente nunca veja tools de
 * domínios ou roles a que não tem acesso.
 * C2: cada tool é registrada com inputSchemaShape real, o agente recebe o schema
 * completo dos parâmetros em tools/list.
 */
function createMcpServerForUser(userCtx: UserContext): McpServer {
  const mcpServer = new McpServer({ name: "nexus-odoo-mcp", version: "1.0.0" });

  // Camada 1, filtro de visibilidade: só tools autorizadas para este usuário
  const tools = visibleTools(catalogo, userCtx);

  for (const tool of tools) {
    // C2: registrar com inputSchemaShape real para que tools/list exiba os parâmetros.
    // O pipeline handleToolCall faz a validação Zod completa via tool.inputSchema.
    mcpServer.tool(
      tool.id,
      tool.descricao,
      tool.inputSchemaShape,
      async (args) => {
        return handleToolCall(tool, args, userCtx.userId);
      },
    );
  }

  return mcpServer;
}

// ─── createHttpServer, 4a.14, 4a.15, 4a.16 ────────────────────────────────

/** Servidor http.Server com o handler principal exposto como `_handler` para testes. */
export type TestableServer = http.Server & {
  _handler: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>;
};

/**
 * Mapa de sessões ativas: sessionId → { mcpServer, transport }.
 * Cada sessão tem seu próprio par McpServer+transport, garantindo isolamento de
 * tools/list por usuário (camada 1 do RBAC).
 * O sessionStore (session-store.ts) mantém o UserContext; este mapa mantém o par MCP.
 */
const sessionMap = new Map<string, { mcpServer: McpServer; transport: StreamableHTTPServerTransport }>();

/**
 * Cria o http.Server com middlewares de auth e McpServer por sessão (Opção A).
 * O campo `_handler` expõe o handler internamente para testes unitários (4a.14/4a.15).
 */
export function createHttpServer(): TestableServer {
  // Handler HTTP principal, 4a.14 (service token) + 4a.15 (sessão) + 4a.16 (transport)
  const handler = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> => {
    // Bloco I, Health check: rota pública, sem auth (antes de qualquer middleware)
    const url = req.url ?? "";
    if (req.method === "GET" && (url === "/health" || url === "/api/mcp/health")) {
      await handleHealthRequest(req, res);
      return;
    }

    // Catálogo de tools, endpoint público de metadados (sem auth, equivalente a /health)
    if (req.method === "GET" && (url === "/api/mcp/catalog-schema" || url === "/catalog-schema")) {
      handleCatalogSchemaRequest(res, catalogo);
      return;
    }

    // Preflight CORS, OPTIONS antes de qualquer auth (Bloco P-0)
    if (req.method === "OPTIONS") {
      // Auth da API key para obter allowedOrigins (best-effort, sem apiKey retorna 403)
      const authResult = await authenticate(prisma, apiKeyCache, {
        headerAuth: req.headers.authorization,
        headerUserId: req.headers["x-mcp-user-id"] as string | undefined,
        requestUrl: req.url,
      });
      const apiKey = authResult.mode === "external" ? authResult.apiKey : undefined;
      const preflight = handlePreflight({ requestOrigin: req.headers.origin as string | undefined, apiKey });
      res.writeHead(preflight.status, { "Content-Type": "text/plain", ...preflight.headers });
      res.end();
      return;
    }

    // ── Auth gate (Bloco P-0) ────────────────────────────────────────────────
    //
    // Estratégia de dois estágios para preservar retrocompat total com testes do
    // modo interno (4a.14/4a.15/C-NOVO) sem alterar seus timings de microtask:
    //
    //   Estágio 1, service token (síncrono, legado):
    //     validateServiceToken() é executado PRIMEIRO.
    //     - Se válido → modo INTERNO (fluxo original sem nenhuma await extra).
    //     - Se inválido → possível modo externo (API key): coletar body e chamar
    //       authenticate() para identificar a API key.
    //
    //   Estágio 2, API key (assíncrono, Bloco P-0):
    //     authenticate() retorna "external" → pipeline externo (handler direto).
    //     authenticate() retorna "unauthorized" → 401.
    //
    // Dessa forma o fluxo interno não acumula awaits extras e os testes existentes
    // continuam funcionando sem modificação de timing.

    const isServiceTokenValid = validateServiceToken(req.headers.authorization);

    if (!isServiceTokenValid) {
      // Possível autenticação externa (API key), Bloco P-0.
      // Ler body antes (necessário para handleExternalRequest).
      // Guard: socket null = ambiente de teste sem stream real → body vazio.
      let bodyBuffer: Buffer = Buffer.alloc(0);
      if (req.socket !== null) {
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(chunk as Buffer);
          }
          bodyBuffer = Buffer.concat(chunks);
        } catch {
          bodyBuffer = Buffer.alloc(0);
        }
      }

      const authResult: AuthResult = await authenticate(prisma, apiKeyCache, {
        headerAuth: req.headers.authorization,
        headerUserId: req.headers["x-mcp-user-id"] as string | undefined,
        requestUrl: req.url,
      });

      if (authResult.mode === "external") {
        const deps: ExternalPipelineDeps = {
          prisma,
          redis: mcpRedis as import("ioredis").default,
          catalog: catalogo as ReadonlyArray<ToolEntry | import("./catalog/types.js").WriteToolEntry>,
        };
        const response = await handleExternalRequest(req, bodyBuffer, authResult.apiKey, deps);
        res.writeHead(response.status, response.headers);
        res.end(response.body);
        return;
      }

      // Token inválido e não é API key → 401
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    // ── Modo interno (service token válido) ──────────────────────────────────
    // Fluxo original 4a.14/4a.15/4a.16, sem awaits extras antes do transport.

    // 4a.15, Middleware de resolução de sessão
    // O X-Mcp-User-Id é obrigatório em cada request (stateless por design).
    const userId = req.headers["x-mcp-user-id"];
    if (!userId || typeof userId !== "string") {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "X-Mcp-User-Id obrigatório" }));
      return;
    }

    const userCtx = await resolveUserContext(prisma, userId);
    if (!userCtx) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Usuário não encontrado ou inativo" }));
      return;
    }

    // 4a.16, McpServer por sessão (Opção A, C1)
    // Se a request traz Mcp-Session-Id já conhecido, reusar o par existente.
    // Se não (initialize ou primeira request), criar novo par McpServer+transport.
    const incomingSessionId = req.headers["mcp-session-id"];
    const existingSession =
      typeof incomingSessionId === "string" ? sessionMap.get(incomingSessionId) : undefined;

    let transport: StreamableHTTPServerTransport;

    if (existingSession) {
      // Atualizar o UserContext da sessão (pode ter mudado desde a última request)
      sessionStore.set(incomingSessionId as string, userCtx);
      transport = existingSession.transport;
    } else {
      // Nova sessão: criar McpServer filtrado pelo usuário + transport
      const newMcpServer = createMcpServerForUser(userCtx);
      // C-NOVO: usar onsessioninitialized para registrar a sessão apenas quando
      // o initialize MCP for processado (sessionId só é atribuído nesse momento,
      // não imediatamente após connect()).
      const newTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          sessionMap.set(sid, { mcpServer: newMcpServer, transport: newTransport });
          sessionStore.set(sid, userCtx);
        },
      });

      // I3, registrar limpeza da sessão no fechamento do transport
      newTransport.onclose = () => {
        const sid = newTransport.sessionId;
        if (sid) {
          sessionMap.delete(sid);
          sessionStore.delete(sid);
        }
      };

      // I2, await para não engolir erro de inicialização
      await newMcpServer.connect(newTransport);

      transport = newTransport;
    }

    // O modo interno não lê o body (o transport lê diretamente do req).
    // Delegar ao transport da sessão
    await transport.handleRequest(req, res);
  };

  const server = http.createServer(handler) as TestableServer;
  server._handler = handler;
  return server;
}

// ─── visibleTools re-export para uso externo ─────────────────────────────────
export { visibleTools };
