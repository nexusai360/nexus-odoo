/**
 * Integração do Agente Nex com servidores MCP externos (Plugar MCP).
 *
 * O agente abre uma sessão de cliente MCP para cada servidor externo
 * habilitado, lista as tools de cada um e as expõe ao LLM com o prefixo
 * `ext__<slug>__`, somando-as ao catálogo interno. Distinto de `mcp-client.ts`,
 * que fala com o NOSSO servidor MCP.
 *
 * Isolamento de falha: um servidor inalcançável é pulado, nunca derruba o run.
 * Cada chamada a tool externa é registrada em `ExternalMcpCallLog`.
 */

import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { Prisma } from "@/generated/prisma/client";
import type { McpTool } from "./mcp-client";

/** Timeout para conectar e listar tools de um servidor externo. */
const CONNECT_TIMEOUT_MS = 4000;
/** Tamanho máximo do JSON de `argsPreview` gravado no log. */
const ARGS_PREVIEW_MAX = 2048;
/** Prefixo das tools externas, distingue do catálogo interno. */
const EXT_PREFIX = "ext__";
/** Chaves cujo valor é redigido antes de ir para o log (segredo). */
const SECRET_KEY_RE = /token|secret|senha|password|key|authorization|bearer/i;

interface ExternalRoute {
  serverId: string;
  serverName: string;
  realName: string;
  client: Client;
}

export interface ExternalMcpBundle {
  /** Tools externas, já com nome prefixado, para somar ao catálogo do LLM. */
  tools: McpTool[];
  /** Mapa nome prefixado -> servidor/tool real. */
  router: Map<string, ExternalRoute>;
  /** Fecha todas as sessões externas. Nunca lança. */
  closeAll: () => Promise<void>;
}

/** `true` se o nome de tool pertence a um MCP externo. */
export function isExternalToolName(name: string): boolean {
  return name.startsWith(EXT_PREFIX);
}

/** Slug curto e único por servidor (nome + fragmento do id). */
export function slugifyServer(name: string, id: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 8) || "mcp";
  const idFrag = id.replace(/[^a-z0-9]/gi, "").slice(0, 4).toLowerCase();
  return `${base}${idFrag}`;
}

/** Nome prefixado da tool externa, limitado a 60 chars (limite de provedores). */
export function prefixedToolName(slug: string, toolName: string): string {
  const full = `${EXT_PREFIX}${slug}__${toolName}`;
  return full.length <= 60 ? full : full.slice(0, 60);
}

/** Redige segredos e limita o tamanho dos args, para gravar no log com segurança. */
export function redactArgs(args: Record<string, unknown>): Prisma.InputJsonValue {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args ?? {})) {
    out[k] = SECRET_KEY_RE.test(k) ? "[redacted]" : v;
  }
  try {
    const json = JSON.stringify(out);
    if (json.length > ARGS_PREVIEW_MAX) {
      return { _truncated: true, preview: json.slice(0, ARGS_PREVIEW_MAX) };
    }
    return out as Prisma.InputJsonValue;
  } catch {
    return { _unserializable: true };
  }
}

/** Race de uma promessa com um timeout. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout após ${ms}ms`)), ms),
    ),
  ]);
}

/** Normaliza o resultado de callTool (content[]) para string. */
function normalizeResult(result: {
  content?: Array<{ type: string; text?: string }>;
}): string {
  if (!result.content || result.content.length === 0) return "(sem resultado)";
  return result.content
    .map((c) => (c.type === "text" ? (c.text ?? "") : `[${c.type}]`))
    .join("\n")
    .trim();
}

type ServerRow = {
  id: string;
  name: string;
  transport: string;
  url: string;
  authHeader: string | null;
  authToken: string | null;
};

function buildTransport(server: ServerRow) {
  const headers: Record<string, string> = {};
  if (server.authHeader && server.authToken) {
    try {
      headers[server.authHeader] = decrypt(server.authToken);
    } catch {
      // token corrompido: segue sem auth, o connect vai refletir a falha
    }
  }
  const url = new URL(server.url);
  if (server.transport === "sse") {
    return new SSEClientTransport(url, { requestInit: { headers } });
  }
  return new StreamableHTTPClientTransport(url, { requestInit: { headers } });
}

/**
 * Abre sessões para todos os servidores MCP externos habilitados, em paralelo.
 * Servidor que falha o connect/listTools é pulado (isolamento). As tools
 * municiam o agente em todo run, como o MCP interno (capacidade de plataforma).
 */
export async function openExternalMcpSessions(): Promise<ExternalMcpBundle> {
  const servers = await prisma.externalMcpServer.findMany({
    where: { enabled: true },
  });

  const tools: McpTool[] = [];
  const router = new Map<string, ExternalRoute>();
  const clients: Client[] = [];

  const settled = await Promise.allSettled(
    servers.map(async (server) => {
      const client = new Client(
        { name: "nexus-odoo-agent-ext", version: "1.0.0" },
        { capabilities: {} },
      );
      await withTimeout(client.connect(buildTransport(server)), CONNECT_TIMEOUT_MS);
      const listed = await withTimeout(client.listTools(), CONNECT_TIMEOUT_MS);
      return { server, client, listed };
    }),
  );

  for (const r of settled) {
    if (r.status !== "fulfilled") {
      console.warn("[external-mcp] servidor MCP externo pulado:", r.reason);
      continue;
    }
    const { server, client, listed } = r.value;
    clients.push(client);
    const slug = slugifyServer(server.name, server.id);
    for (const t of listed.tools ?? []) {
      const prefixed = prefixedToolName(slug, t.name);
      if (router.has(prefixed)) {
        console.warn(`[external-mcp] colisão de nome de tool, ignorada: ${prefixed}`);
        continue;
      }
      tools.push({
        name: prefixed,
        description: t.description ?? "",
        inputSchema:
          (t.inputSchema as Record<string, unknown>) ?? {
            type: "object",
            properties: {},
          },
      });
      router.set(prefixed, {
        serverId: server.id,
        serverName: server.name,
        realName: t.name,
        client,
      });
    }
  }

  return {
    tools,
    router,
    async closeAll() {
      await Promise.allSettled(clients.map((c) => c.close()));
    },
  };
}

/**
 * Executa uma tool de MCP externo e grava `ExternalMcpCallLog`. Nunca lança:
 * erro vira `outcome="error"` no log e string de erro para o LLM.
 */
export async function callExternalTool(
  bundle: ExternalMcpBundle,
  prefixedName: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<string> {
  const route = bundle.router.get(prefixedName);
  if (!route) {
    return `(MCP externo: a ferramenta "${prefixedName}" não está disponível)`;
  }

  const start = Date.now();
  let outcome = "ok";
  let errorMessage: string | null = null;
  let result: string;
  try {
    const raw = await route.client.callTool({
      name: route.realName,
      arguments: args,
    });
    result = normalizeResult(
      raw as { content?: Array<{ type: string; text?: string }> },
    );
  } catch (err) {
    outcome = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
    result = `(Erro ao chamar a tool externa ${route.realName}: ${errorMessage})`;
  }

  // Log best-effort: falha de log nunca derruba a chamada do agente.
  try {
    await prisma.externalMcpCallLog.create({
      data: {
        serverId: route.serverId,
        serverName: route.serverName,
        toolName: route.realName,
        outcome,
        durationMs: Date.now() - start,
        errorMessage,
        argsPreview: redactArgs(args),
        userId,
      },
    });
  } catch (logErr) {
    console.error("[external-mcp] falha ao gravar ExternalMcpCallLog:", logErr);
  }

  return result;
}
