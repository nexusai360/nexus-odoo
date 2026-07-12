// mcp/dispatcher/external-pipeline.ts
//
// Pipeline de requisições EXTERNAS ao servidor MCP.
// Implementa o handler JSON-RPC direto para o modo "external" (API key),
// distinto do modo interno que usa StreamableHTTPServerTransport + McpServer.
//
// DECISÃO DE ARQUITETURA , Handler JSON-RPC Direto (vs. Transport SDK):
//   O modo externo NÃO usa StreamableHTTPServerTransport. Razão: o pipeline
//   externo requer controle fino por requisição , idempotency, audit enriquecido
//   com apiKeyId, sync direcionado pós-write, headers CORS/rate-limit , que não
//   se encaixam no ciclo de vida gerenciado pelo transport do SDK sem monkey-patch.
//   A alternativa (handler direto: parsear body → rotear tools/list | tools/call
//   → responder JSON) é mais simples, 100% testável via injeção de deps e não
//   depende de side effects do transport. O modo interno continua com o transport.
//
// Funções exportadas:
//   handleExternalRequest  , entry point do handler HTTP (deps injetáveis)
//   handleExternalToolCall , sub-handler de tools/call (testável isoladamente)
//   handleExternalToolList , sub-handler de tools/list

import { randomUUID } from "node:crypto";
import type * as http from "node:http";
import type { PrismaClient } from "@/generated/prisma/client";
import type Redis from "ioredis";

import type { ApiKeyContext } from "../auth/api-key-context.js";
import type { ToolEntry, WriteToolEntry, WriteToolHandlerCtx } from "../catalog/types.js";
import { isWriteToolEntry } from "../catalog/types.js";
import { visibleToolsForApiKey } from "../catalog/api-key-catalog.js";
import { checkMode } from "./check-mode.js";
import { checkIdempotency } from "../middleware/idempotency.js";
import { recordIdempotencyResult } from "../middleware/idempotency-store.js";
import { corsHeaders } from "../middleware/cors.js";
import { releaseLock } from "../lib/distributed-lock.js";
import { checkMcpRateLimitFor, type RateLimitRedis } from "../lib/rate-limit.js";
import { rateLimitHeaders } from "../lib/rate-limit-headers.js";
import { canonicalHash } from "../lib/canonical-json.js";
import { truncateSnapshot } from "../lib/snapshot.js";
import { getDirectedSyncQueue } from "../sync/queue.js";
import logger from "../lib/logger.js";
import { clientFromEnv } from "@/worker/odoo/client.js";
import { getCorteDados } from "@/lib/corte-dados.js";

// ─── Tipos públicos ──────────────────────────────────────────────────────────

/** Response JSON-RPC 2.0 padrão. */
export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** Resultado de ferramenta no protocolo MCP. */
export interface McpToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
  _meta?: {
    request_id: string;
    idempotency_key?: string;
    duration_ms: number;
    server_version: string;
    protocol_version: string;
  };
}

/** Deps injetáveis para handleExternalRequest , permite mock completo em testes. */
export interface ExternalPipelineDeps {
  prisma: PrismaClient;
  /** ioredis Redis , usado via RateLimitRedis (pipeline) e acquireLock/releaseLock (SET NX). */
  redis: Redis;
  catalog: ReadonlyArray<ToolEntry | WriteToolEntry>;
  /** Se undefined, usa getDirectedSyncQueue() real. */
  syncQueue?: {
    add(name: string, data: unknown): Promise<unknown>;
  };
  /** Se undefined, usa clientFromEnv("write"). */
  odooClientFactory?: () => ReturnType<typeof clientFromEnv>;
  /** SERVER_VERSION exibida em _meta. */
  serverVersion?: string;
}

// ─── Helpers internos ────────────────────────────────────────────────────────

const PROTOCOL_VERSION = "2025-06-18";
const DEFAULT_SERVER_VERSION = "1.0.0";

function jsonRpcError(
  id: string | number | null,
  httpCode: number,
  message: string,
  data?: unknown,
): { status: number; body: JsonRpcResponse } {
  return {
    status: httpCode,
    body: {
      jsonrpc: "2.0",
      id,
      error: { code: httpCode, message, data },
    },
  };
}

function mcpErrorContent(
  id: string | number | null,
  errorCode: string,
  message: string,
  requestId: string,
  durationMs: number,
  serverVersion: string,
): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: errorCode, message }) }],
    isError: true,
    _meta: {
      request_id: requestId,
      duration_ms: durationMs,
      server_version: serverVersion,
      protocol_version: PROTOCOL_VERSION,
    },
  };
}

// ─── Redaction de PII em payload ─────────────────────────────────────────────

/** Campos sensíveis que devem ser substituídos por "[REDACTED]" no audit log. */
const SENSITIVE_FIELD_RE = /(cpf|cnpj|password|senha|token|secret)/i;

/**
 * Redacta campos sensíveis em um payload plano.
 * Processa apenas o primeiro nível (shallow). Arrays são preservados como estão.
 * Campos cujo nome case-insensitive bate com SENSITIVE_FIELD_RE viram "[REDACTED]".
 */
export function redactPayload(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    out[k] = SENSITIVE_FIELD_RE.test(k) ? "[REDACTED]" : v;
  }
  return out;
}

// ─── Tipos do audit externo ───────────────────────────────────────────────────

export interface ExternalAuditFields {
  apiKeyId: string;
  toolId: string;
  requestId: string;
  idempotencyKey?: string;
  /** Input bruto (será redactado internamente). */
  input: unknown;
  /** "success" | "denied" | "validation_error" | "odoo_error" | "rate_limited" | "error" */
  status: string;
  httpStatus: number;
  durationMs: number;
  operation: "read" | "write";
  module?: string;
  action?: string;
  capability?: string;
  eventName?: string;
  snapshotBefore?: object | null;
  snapshotAfter?: object | null;
  resultData?: unknown;
  errorCode?: string;
  errorMessage?: string;
  /** Política §10.5: se true, payload NÃO é gravado (apenas token inválido). */
  suppressPayload?: boolean;
}

/**
 * Mapeia status externo para o outcome legado (campo `outcome` do schema legado).
 * Mantém compatibilidade com o campo original enquanto o novo campo `status` é granular.
 */
function toOutcomeLegacy(status: string): "ok" | "denied" | "error" | "invalid_input" {
  if (status === "success") return "ok";
  if (status === "denied" || status === "rate_limited") return "denied";
  if (status === "validation_error") return "invalid_input";
  return "error";
}

/**
 * Grava McpAuditLog com todos os campos do Bloco B (migration 20260521001439_f4_onda2_mcp_writes).
 *
 * IMPORTANTE: usa createMany() para suprimir o RETURNING implícito do Prisma/adapter-pg.
 * O role nexus_mcp tem GRANT INSERT mas não SELECT em mcp_audit_log , createMany()
 * emite apenas INSERT sem RETURNING, preservando menor privilégio.
 *
 * Política §10.5: status "unauthorized" (token inválido) → NÃO grava payload.
 * Outros denials → grava payload com redaction de PII.
 *
 * Falha silenciosa: nunca lança , falha de audit não derruba o pipeline.
 */
export async function recordExternalAudit(
  prisma: PrismaClient,
  fields: ExternalAuditFields,
): Promise<void> {
  try {
    // Política §10.5: sem payload para unauthorized
    const payloadToStore = fields.suppressPayload
      ? null
      : (redactPayload(fields.input) as object | null);

    const capabilityStr =
      fields.capability ??
      (fields.module && fields.action ? `${fields.module}.${fields.action}` : undefined);

    // Truncar snapshots antes de persistir (evita linhas gigantescas no banco).
    // Para nullable JSON fields: usar undefined para omitir o campo quando não há valor
    // (Prisma interpreta undefined como "não alterar/omitir" em createMany).
    const safeBefore = fields.snapshotBefore
      ? (truncateSnapshot(fields.snapshotBefore as Record<string, unknown>) as object)
      : undefined;
    const safeAfter = fields.snapshotAfter
      ? (truncateSnapshot(fields.snapshotAfter as Record<string, unknown>) as object)
      : undefined;
    const safeResultVal =
      fields.resultData !== undefined
        ? ({ _raw: truncateSnapshot({ _r: JSON.stringify(fields.resultData) })._r } as object)
        : undefined;

    // Para o campo legado params (NOT NULL): usar {} quando payload é suprimido.
    const prismaParams = (payloadToStore ?? {}) as object;

    await prisma.mcpAuditLog.createMany({
      data: [
        {
          // Campos legados (compatibilidade)
          userId: fields.apiKeyId,
          tool: fields.toolId,
          params: prismaParams,
          outcome: toOutcomeLegacy(fields.status),
          durationMs: fields.durationMs,

          // Campos novos (F4 Onda 2 , migration 20260521001439_f4_onda2_mcp_writes)
          apiKeyId: fields.apiKeyId,
          authMode: "external",
          operation: fields.operation,
          module: fields.module ?? null,
          action: fields.action ?? null,
          capability: capabilityStr ?? null,
          eventName: fields.eventName ?? null,
          requestId: fields.requestId,
          idempotencyKey: fields.idempotencyKey ?? null,
          payload: payloadToStore as object | undefined,
          result: safeResultVal,
          snapshotBefore: safeBefore,
          snapshotAfter: safeAfter,
          status: fields.status,
          httpStatus: fields.httpStatus,
          errorCode: fields.errorCode ?? null,
          errorMessage: fields.errorMessage ?? null,
        },
      ],
    });
  } catch (err) {
    logger.error(
      { err, toolId: fields.toolId, apiKeyId: fields.apiKeyId, requestId: fields.requestId },
      "external-pipeline: AUDIT_FAILURE",
    );
  }
}

// ─── tools/list externo ──────────────────────────────────────────────────────

/**
 * Retorna o catálogo de tools visíveis para a API key, no formato MCP tools/list.
 */
export function handleExternalToolList(
  id: string | number | null,
  catalog: ReadonlyArray<ToolEntry | WriteToolEntry>,
  apiKey: ApiKeyContext,
): JsonRpcResponse {
  const tools = visibleToolsForApiKey(catalog, apiKey);

  const toolList = tools.map((tool) => ({
    name: tool.id,
    description: tool.descricao,
    inputSchema: {
      type: "object",
      properties: Object.fromEntries(
        Object.entries(tool.inputSchemaShape).map(([k, schema]) => {
          // Tenta extrair descrição do Zod de forma segura sem depender de _def tipado
          const maybeDesc = (schema as unknown as Record<string, unknown>)._def;
          const desc =
            maybeDesc && typeof maybeDesc === "object" && "description" in maybeDesc
              ? String((maybeDesc as Record<string, unknown>).description)
              : undefined;
          return [k, desc ? { description: desc } : {}];
        }),
      ),
    },
  }));

  return {
    jsonrpc: "2.0",
    id,
    result: { tools: toolList },
  };
}

// ─── tools/call externo , write ──────────────────────────────────────────────

export interface HandleExternalWriteCallOpts {
  id: string | number | null;
  tool: WriteToolEntry;
  rawInput: unknown;
  apiKey: ApiKeyContext;
  idempotencyKey?: string;
  requestId: string;
  headers: Record<string, string | undefined>;
  prisma: PrismaClient;
  redis: Redis;
  syncQueue: { add(name: string, data: unknown): Promise<unknown> };
  odooClientFactory: () => ReturnType<typeof clientFromEnv>;
  serverVersion: string;
}

/**
 * Pipeline completo de tools/call para WriteToolEntry no modo externo.
 * Retorna { status, body, corsExtra? } , o caller aplica CORS e envia a resposta.
 */
export async function handleExternalWriteCall(
  opts: HandleExternalWriteCallOpts,
): Promise<{ status: number; body: JsonRpcResponse }> {
  const {
    id, tool, rawInput, apiKey, requestId, headers, prisma, redis, syncQueue,
    odooClientFactory, serverVersion,
  } = opts;
  const start = Date.now();

  // Kill switch , feature_disabled
  if (process.env.MCP_WRITE_ENABLED !== "true") {
    logger.warn({ toolId: tool.id, apiKeyId: apiKey.apiKeyId }, "write disabled (MCP_WRITE_ENABLED != true)");
    const dur = Date.now() - start;
    return {
      status: 503,
      body: {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify({ error: "feature_disabled", message: "Write operations are currently disabled." }) }],
          isError: true,
          _meta: { request_id: requestId, duration_ms: dur, server_version: serverVersion, protocol_version: PROTOCOL_VERSION },
        },
      },
    };
  }

  // Idempotency
  const idempotencyKey = headers["idempotency-key"] ?? headers["Idempotency-Key"];
  const payloadHash = canonicalHash(rawInput);
  const idempotencyOpts = {
    operation: "write" as const,
    apiKeyId: apiKey.apiKeyId,
    toolId: tool.id,
    payload: rawInput,
    headers,
    prisma,
    redis,
  };

  const idemResult = await checkIdempotency(idempotencyOpts);

  if (idemResult.status === "cached") {
    const dur = Date.now() - start;
    return {
      status: 200,
      body: {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(idemResult.cachedResult) }],
          isError: false,
          _meta: { request_id: requestId, idempotency_key: idempotencyKey, duration_ms: dur, server_version: serverVersion, protocol_version: PROTOCOL_VERSION },
        },
      },
    };
  }

  if (typeof idemResult.status === "number") {
    const dur = Date.now() - start;
    const httpStatus = idemResult.status as number;
    const errCode = idemResult.errorCode ?? "idempotency_error";
    return {
      status: httpStatus,
      body: {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify({ error: errCode }) }],
          isError: true,
          _meta: { request_id: requestId, idempotency_key: idempotencyKey, duration_ms: dur, server_version: serverVersion, protocol_version: PROTOCOL_VERSION },
        },
      },
    };
  }

  // status === "proceed" , idemResult.lockKey disponível
  const lockKey = idemResult.lockKey;

  // Validação Zod do input
  let parsedInput: unknown;
  try {
    parsedInput = tool.inputSchema.parse(rawInput);
  } catch (err) {
    const dur = Date.now() - start;
    if (lockKey) await releaseLock(redis, lockKey);
    return {
      status: 400,
      body: {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify({ error: "validation_failed", message: String(err) }) }],
          isError: true,
          _meta: { request_id: requestId, idempotency_key: idempotencyKey, duration_ms: dur, server_version: serverVersion, protocol_version: PROTOCOL_VERSION },
        },
      },
    };
  }

  // Montar contexto do handler , UserContext sintético derivado da ApiKey
  const syntheticUser = {
    userId: apiKey.apiKeyId,
    role: "viewer" as const,   // mínimo necessário; gate já feito via capability
    domains: [] as string[],
  };

  const odoo = odooClientFactory();
  try {
    await odoo.authenticate();
  } catch (err) {
    const dur = Date.now() - start;
    if (lockKey) await releaseLock(redis, lockKey);
    logger.error({ err, toolId: tool.id, requestId }, "external-pipeline: odoo authenticate failed");
    return {
      status: 502,
      body: {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify({ error: "odoo_unavailable", message: "Could not connect to Odoo." }) }],
          isError: true,
          _meta: { request_id: requestId, idempotency_key: idempotencyKey, duration_ms: dur, server_version: serverVersion, protocol_version: PROTOCOL_VERSION },
        },
      },
    };
  }

  const writeCtx: WriteToolHandlerCtx = {
    prisma,
    user: syntheticUser as Parameters<typeof tool.handler>[1]["user"],
    odoo,
    requestId,
    idempotencyKey: idempotencyKey ?? "",
  };

  let writeResult: Awaited<ReturnType<typeof tool.handler>>;
  try {
    writeResult = await tool.handler(parsedInput, writeCtx);
  } catch (err) {
    const dur = Date.now() - start;
    if (lockKey) await releaseLock(redis, lockKey);

    let httpStatus = 500;
    let errorCode = "internal_error";
    if (err && typeof err === "object" && "httpStatus" in err) {
      httpStatus = (err as { httpStatus: number }).httpStatus;
      errorCode = (err as { code?: string }).code ?? errorCode;
    }

    await recordExternalAudit(prisma, {
      apiKeyId: apiKey.apiKeyId, toolId: tool.id, requestId,
      idempotencyKey, input: rawInput,
      status: "odoo_error", httpStatus, durationMs: dur,
      operation: "write",
      module: tool.capability.module, action: tool.capability.action,
      eventName: tool.eventName,
      errorCode, errorMessage: err instanceof Error ? err.message : String(err),
    });

    return {
      status: httpStatus,
      body: {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify({ error: errorCode, message: err instanceof Error ? err.message : String(err) }) }],
          isError: true,
          _meta: { request_id: requestId, idempotency_key: idempotencyKey, duration_ms: dur, server_version: serverVersion, protocol_version: PROTOCOL_VERSION },
        },
      },
    };
  }

  const dur = Date.now() - start;
  const resultId = Array.isArray(writeResult.id) ? writeResult.id[0] : writeResult.id;

  // Truncar snapshots antes de persistir
  const safeBefore = writeResult.snapshotBefore
    ? truncateSnapshot(writeResult.snapshotBefore as Record<string, unknown>)
    : null;
  const safeAfter = writeResult.snapshotAfter
    ? truncateSnapshot(writeResult.snapshotAfter as Record<string, unknown>)
    : null;

  // Audit de sucesso
  await recordExternalAudit(prisma, {
    apiKeyId: apiKey.apiKeyId, toolId: tool.id, requestId,
    idempotencyKey, input: rawInput,
    status: "success", httpStatus: 200, durationMs: dur,
    operation: "write",
    module: tool.capability.module, action: tool.capability.action,
    capability: `${tool.capability.module}.${tool.capability.action}`,
    eventName: tool.eventName, snapshotBefore: safeBefore, snapshotAfter: safeAfter,
    resultData: writeResult.data,
  });

  // Persistir resultado idempotente
  await recordIdempotencyResult({
    prisma,
    apiKeyId: apiKey.apiKeyId,
    key: idempotencyKey ?? requestId,
    toolId: tool.id,
    payloadHash,
    result: writeResult.data as object,
    status: "success",
    httpStatus: 200,
  });

  // Enfileirar sync direcionado
  try {
    await syncQueue.add("sync", {
      model: tool.odooModel,
      ids: [resultId],
      operation: "create",
      snapshotAfter: safeAfter,
      requestId,
      apiKeyId: apiKey.apiKeyId,
    });
  } catch (err) {
    // Não derrubar a resposta , sync é best-effort (o cron incremental é o fallback)
    logger.error({ err, toolId: tool.id, requestId }, "external-pipeline: sync queue error (best-effort)");
  }

  // Liberar lock de idempotency
  if (lockKey) await releaseLock(redis, lockKey);

  return {
    status: 200,
    body: {
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: JSON.stringify(writeResult.data) }],
        isError: false,
        _meta: {
          request_id: requestId,
          idempotency_key: idempotencyKey,
          duration_ms: dur,
          server_version: serverVersion,
          protocol_version: PROTOCOL_VERSION,
        },
      },
    },
  };
}

// ─── tools/call externo , read ───────────────────────────────────────────────

export interface HandleExternalReadCallOpts {
  id: string | number | null;
  tool: ToolEntry;
  rawInput: unknown;
  apiKey: ApiKeyContext;
  requestId: string;
  prisma: PrismaClient;
  serverVersion: string;
}

export async function handleExternalReadCall(
  opts: HandleExternalReadCallOpts,
): Promise<{ status: number; body: JsonRpcResponse }> {
  const { id, tool, rawInput, apiKey, requestId, prisma, serverVersion } = opts;
  const start = Date.now();

  // Data de inicio das analises: mesmo motivo do pipeline interno (mcp/server.ts) , o
  // processo do MCP precisa hidratar o corte antes de qualquer tool montar where de data.
  await getCorteDados(prisma);

  // Validação Zod
  let parsedInput: unknown;
  try {
    parsedInput = tool.inputSchema.parse(rawInput);
  } catch (err) {
    const dur = Date.now() - start;
    await recordExternalAudit(prisma, {
      apiKeyId: apiKey.apiKeyId, toolId: tool.id, requestId,
      input: rawInput, status: "validation_error", httpStatus: 400,
      durationMs: dur, operation: "read", module: tool.dominio,
      errorCode: "validation_failed", errorMessage: String(err),
    });
    return {
      status: 400,
      body: {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify({ error: "validation_failed", message: String(err) }) }],
          isError: true,
          _meta: { request_id: requestId, duration_ms: dur, server_version: serverVersion, protocol_version: PROTOCOL_VERSION },
        },
      },
    };
  }

  const syntheticUser = {
    userId: apiKey.apiKeyId,
    role: "viewer" as const,
    domains: [] as string[],
  };

  let output: unknown;
  try {
    output = await tool.handler(parsedInput, { prisma, user: syntheticUser as Parameters<typeof tool.handler>[1]["user"] });
  } catch (err) {
    const dur = Date.now() - start;
    await recordExternalAudit(prisma, {
      apiKeyId: apiKey.apiKeyId, toolId: tool.id, requestId,
      input: rawInput, status: "error", httpStatus: 500,
      durationMs: dur, operation: "read", module: tool.dominio,
      errorCode: "tool_error", errorMessage: err instanceof Error ? err.message : String(err),
    });
    return {
      status: 500,
      body: {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify({ error: "tool_error", message: err instanceof Error ? err.message : String(err) }) }],
          isError: true,
          _meta: { request_id: requestId, duration_ms: dur, server_version: serverVersion, protocol_version: PROTOCOL_VERSION },
        },
      },
    };
  }

  const dur = Date.now() - start;
  await recordExternalAudit(prisma, {
    apiKeyId: apiKey.apiKeyId, toolId: tool.id, requestId,
    input: rawInput, status: "success", httpStatus: 200,
    durationMs: dur, operation: "read", module: tool.dominio,
    resultData: output,
  });
  return {
    status: 200,
    body: {
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: JSON.stringify(output) }],
        isError: false,
        _meta: { request_id: requestId, duration_ms: dur, server_version: serverVersion, protocol_version: PROTOCOL_VERSION },
      },
    },
  };
}

// ─── handleExternalRequest , entry point ─────────────────────────────────────

/**
 * Processa uma requisição MCP no modo externo (API key).
 * Roteia tools/list → handleExternalToolList
 *         tools/call → handleExternalWriteCall | handleExternalReadCall
 * Aplica rate limit, checkMode e headers CORS.
 *
 * Retorna a resposta pronta; o caller (server.ts) chama res.writeHead + res.end.
 */
export async function handleExternalRequest(
  req: http.IncomingMessage,
  body: Buffer,
  apiKey: ApiKeyContext,
  deps: ExternalPipelineDeps,
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const serverVersion = deps.serverVersion ?? DEFAULT_SERVER_VERSION;
  const requestOrigin = req.headers.origin as string | undefined;
  const reqHeaders = Object.fromEntries(
    Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  ) as Record<string, string | undefined>;

  // Parsear body JSON-RPC
  let parsed: { jsonrpc?: string; id?: string | number | null; method?: string; params?: unknown };
  try {
    parsed = JSON.parse(body.toString("utf8")) as typeof parsed;
  } catch {
    const cors = corsHeaders({ requestOrigin, apiKey });
    return {
      status: 400,
      headers: { "Content-Type": "application/json", ...cors },
      body: JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: 400, message: "Invalid JSON" } }),
    };
  }

  const rpcId = parsed.id ?? null;
  const method = parsed.method ?? "";

  // Rate limit (por API key)
  const rlResult = await checkMcpRateLimitFor(deps.redis as RateLimitRedis, {
    type: "apiKey",
    apiKeyId: apiKey.apiKeyId,
    limit: apiKey.rateLimit,
  });

  const rlHeaders = rateLimitHeaders(rlResult);
  const cors = corsHeaders({ requestOrigin, apiKey });
  const commonHeaders = { "Content-Type": "application/json", ...rlHeaders, ...cors };

  if (!rlResult.allowed) {
    logger.warn({ apiKeyId: apiKey.apiKeyId }, "external-pipeline: rate limit exceeded");
    return {
      status: 429,
      headers: commonHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: rpcId,
        error: { code: 429, message: "Rate limit exceeded. Try again later." },
      }),
    };
  }

  // ── tools/list ──
  if (method === "tools/list") {
    const response = handleExternalToolList(rpcId, deps.catalog, apiKey);
    return { status: 200, headers: commonHeaders, body: JSON.stringify(response) };
  }

  // ── tools/call ──
  if (method === "tools/call") {
    const params = parsed.params as { name?: string; arguments?: unknown } | undefined;
    const toolName = params?.name;
    const rawInput = params?.arguments ?? {};
    const requestId = randomUUID();

    if (!toolName) {
      return {
        status: 400,
        headers: commonHeaders,
        body: JSON.stringify({ jsonrpc: "2.0", id: rpcId, error: { code: 400, message: "Missing tool name in params.name" } }),
      };
    }

    // Lookup da tool no catálogo
    const tool = deps.catalog.find((t) => t.id === toolName);
    if (!tool) {
      return {
        status: 200,
        headers: commonHeaders,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: rpcId,
          result: {
            content: [{ type: "text", text: JSON.stringify({ error: "tool_not_found", message: `Tool '${toolName}' not found.` }) }],
            isError: true,
          },
        }),
      };
    }

    // checkMode , capability gate
    const modeCheck = checkMode(tool, { mode: "external", apiKey });
    if (!modeCheck.allowed) {
      logger.warn({ toolId: toolName, apiKeyId: apiKey.apiKeyId, errorCode: modeCheck.errorCode }, "external-pipeline: mode check denied");
      return {
        status: 403,
        headers: commonHeaders,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: rpcId,
          result: {
            content: [{ type: "text", text: JSON.stringify({ error: modeCheck.errorCode, required: modeCheck.required }) }],
            isError: true,
          },
        }),
      };
    }

    // Dispatch write vs read
    if (isWriteToolEntry(tool)) {
      const syncQueue = deps.syncQueue ?? getDirectedSyncQueue();
      const odooClientFactory = deps.odooClientFactory ?? (() => clientFromEnv("write"));
      const { status, body: respBody } = await handleExternalWriteCall({
        id: rpcId,
        tool,
        rawInput,
        apiKey,
        requestId,
        headers: reqHeaders,
        prisma: deps.prisma,
        redis: deps.redis,
        syncQueue,
        odooClientFactory,
        serverVersion,
      });
      return { status, headers: commonHeaders, body: JSON.stringify(respBody) };
    } else {
      const { status, body: respBody } = await handleExternalReadCall({
        id: rpcId,
        tool,
        rawInput,
        apiKey,
        requestId,
        prisma: deps.prisma,
        serverVersion,
      });
      return { status, headers: commonHeaders, body: JSON.stringify(respBody) };
    }
  }

  // Método desconhecido
  return {
    status: 400,
    headers: commonHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: rpcId,
      error: { code: -32601, message: `Method '${method}' not found. Supported: tools/list, tools/call.` },
    }),
  };
}
