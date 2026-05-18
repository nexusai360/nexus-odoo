// mcp/server.ts
// Servidor HTTP do MCP — middlewares de auth + sessão + McpServer + pipeline de tools/call.
// Decomposto nas tasks 4a.14 (service token) / 4a.15 (sessão) / 4a.16 (transport+McpServer)
// / 4a.17 (pipeline tools/call).
//
// NOTA DE ARQUITETURA (SDK-NOTES.md):
// O McpServer do SDK não permite sobrescrever ListToolsRequestSchema/CallToolRequestSchema
// após McpServer inicializado (assertRequestHandlerCapability lança). A abordagem adotada:
// - Registramos cada tool com registerTool passando o handler real (com RBAC completo).
// - O filtro de tools/list por usuário é implementado via um McpServer por sessão OU via
//   a abordagem de registrar todas as tools mas devolver erro de acesso negado se não
//   autorizado — aceitável para F4 (catálogo pequeno, cliente único).
// - Para F5 (WhatsApp com múltiplos usuários simultâneos), considerar McpServer por sessão.
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { validateServiceToken } from "./auth/service-token.js";
import { resolveUserContext, type UserContext } from "./auth/user-context.js";
import { sessionStore } from "./auth/session-store.js";
import { prisma } from "./lib/prisma.js";
import { catalogo } from "./catalog/index.js";
import { visibleTools, assertToolAllowed } from "./catalog/registry.js";
import { recordAudit, extractRowCount, type AuditOutcome } from "./lib/audit.js";
import { toOutcome, safeErrorMessage } from "./lib/failure.js";
import type { ToolEntry } from "./catalog/types.js";

// ─── handleToolCall — pipeline de tools/call (4a.17) ────────────────────────

export interface HandleToolCallDeps {
  resolveUser: typeof resolveUserContext;
  record: typeof recordAudit;
}

/**
 * Pipeline de tools/call com RBAC (camadas 2/6/7), validação Zod e audit.
 * Segue a ordem: recarregar UserContext → assertToolAllowed → parse input
 *   → executar handler → audit em todos os caminhos.
 */
export async function handleToolCall(
  tool: ToolEntry,
  rawInput: unknown,
  userId: string,
  deps: HandleToolCallDeps = { resolveUser: resolveUserContext, record: recordAudit },
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: true }> {
  const start = Date.now();
  let outcome: AuditOutcome = "error";

  try {
    // Camada 6: recarregar UserContext (proteção contra sessão expirada/revogada)
    const user = await deps.resolveUser(prisma, userId);
    if (!user) {
      outcome = "denied";
      await auditSafe(deps.record, userId, tool.id, rawInput, outcome, undefined, Date.now() - start);
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
    await auditSafe(deps.record, userId, tool.id, rawInput, outcome, undefined, Date.now() - start);
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
): Promise<void> {
  try {
    await record(prisma, { userId, tool, params, outcome, rowCount, durationMs });
  } catch {
    // Falha de audit não derruba a resposta
    console.error("[mcp] falha ao gravar audit log");
  }
}

function errorResult(message: string): { content: Array<{ type: "text"; text: string }>; isError: true } {
  return { content: [{ type: "text", text: message }], isError: true };
}

// ─── createHttpServer — 4a.14, 4a.15, 4a.16 ────────────────────────────────

/** Servidor http.Server com o handler principal exposto como `_handler` para testes. */
export type TestableServer = http.Server & {
  _handler: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>;
};

/**
 * Cria o http.Server com middlewares de auth e o McpServer com Streamable HTTP.
 * O campo `_handler` expõe o handler internamente para testes unitários (4a.14/4a.15).
 */
export function createHttpServer(): TestableServer {
  // Um McpServer e um transport por instância de servidor.
  const mcpServer = new McpServer({ name: "nexus-odoo-mcp", version: "1.0.0" });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  // 4a.16 — Registrar todas as tools com o handler real (RBAC completo).
  // tools/list reflete o catálogo completo; o handler nega acesso se não autorizado.
  // (Filtro por usuário em tools/list planejado para F5 — McpServer por sessão.)
  for (const tool of catalogo) {
    // Registrar com schema vazio — o input real é validado pelo handleToolCall via Zod.
    // Sem inputSchema no SDK, o callback recebe só `extra`; com `{}`, recebe (args, extra).
    mcpServer.tool(
      tool.id,
      tool.descricao,
      {},
      async (args, sdkExtra) => {
        // Recuperar o userId da sessão via sessionId do transport
        const mcpSessionId =
          (sdkExtra as { sessionId?: string }).sessionId ?? "";
        const ctx: UserContext | undefined = sessionStore.get(mcpSessionId);
        if (!ctx) {
          return errorResult(safeErrorMessage("denied"));
        }
        return handleToolCall(tool, args, ctx.userId);
      },
    );
  }

  // Conectar o McpServer ao transport.
  void mcpServer.connect(transport);

  // Handler HTTP principal — 4a.14 (service token) + 4a.15 (sessão) + 4a.16 (transport)
  const handler = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> => {
    // 4a.14 — Middleware de service token
    if (!validateServiceToken(req.headers.authorization)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    // 4a.15 — Middleware de resolução de sessão
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

    // Gravar no session-store. O transport emite Mcp-Session-Id no response header
    // da requisição de initialize. Para requests subsequentes, o cliente envia
    // Mcp-Session-Id no header. Usamos esse ID como chave do session-store.
    const mcpSessionId = req.headers["mcp-session-id"];
    const sessionKey = typeof mcpSessionId === "string" ? mcpSessionId : randomUUID();
    sessionStore.set(sessionKey, userCtx);

    // 4a.16 — Delegar ao transport Streamable HTTP
    await transport.handleRequest(req, res);
  };

  const server = http.createServer(handler) as TestableServer;
  server._handler = handler;
  return server;
}

// ─── visibleTools re-export para uso externo ─────────────────────────────────
export { visibleTools };
