/**
 * Cliente MCP do agente nexus-odoo.
 *
 * Usa @modelcontextprotocol/sdk (Client + StreamableHTTPClientTransport).
 * Cada invocação de runAgent cria uma sessão nova (B1: sessão por invocação).
 * O chamador é responsável por chamar close() no finally.
 *
 * Autenticação: Bearer token via Authorization + userId via x-mcp-user-id.
 * Contrato definido em mcp/server.ts e mcp/auth/service-token.ts.
 */

import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp";
import type { ToolDefinition } from "./llm/types";

/** Formato de tool retornado pelo MCP (listTools). */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Sessão MCP aberta , fechada pelo chamador via close(). */
export interface McpSession {
  listTools(): Promise<McpTool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<string>;
  close(): Promise<void>;
}

/**
 * Remove campos do JSON Schema incompatíveis com a API do Gemini/OpenRouter.
 *
 * A API Gemini aceita apenas o subconjunto OpenAPI 3.0:
 * - `$schema` → não aceito
 * - `additionalProperties` → não aceito
 * - `$ref` → não aceito (deve ser resolvido inline antes)
 *
 * Anthropic e OpenAI toleram campos extras, mas sanitizar é inócuo.
 */
export function sanitizeMcpSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const BLOCKED = new Set(["$schema", "additionalProperties", "$ref", "$defs", "definitions"]);
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schema)) {
    if (BLOCKED.has(key)) continue;

    if (key === "properties" && typeof value === "object" && value !== null) {
      const props: Record<string, unknown> = {};
      for (const [pk, pv] of Object.entries(value as Record<string, unknown>)) {
        props[pk] = typeof pv === "object" && pv !== null
          ? sanitizeMcpSchema(pv as Record<string, unknown>)
          : pv;
      }
      result[key] = props;
    } else if (key === "items" && typeof value === "object" && value !== null) {
      result[key] = sanitizeMcpSchema(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Converte a lista de tools do MCP para o formato ToolDefinition
 * que os adapters de LLM (mapTools) consomem.
 * Sanitiza o inputSchema para compatibilidade com Gemini/OpenRouter.
 */
export function mcpToolsToProviderTools(mcpTools: McpTool[]): ToolDefinition[] {
  return mcpTools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: sanitizeMcpSchema(t.inputSchema) as ToolDefinition["parameters"],
  }));
}

/**
 * Normaliza o resultado de callTool (formato MCP content[]) para string.
 * Um array de content items pode ter type "text", "image", "resource", etc.
 * Para o agente, basta o texto concatenado.
 */
function normalizeMcpResult(
  result: { content?: Array<{ type: string; text?: string }> },
): string {
  if (!result.content || result.content.length === 0) return "(sem resultado)";
  return result.content
    .map((c) => (c.type === "text" ? (c.text ?? "") : `[${c.type}]`))
    .join("\n")
    .trim();
}

/**
 * Abre uma sessão MCP para um usuário específico.
 *
 * Requer:
 * - `MCP_URL` no ambiente (URL base do servidor MCP, ex: http://mcp:3001/mcp)
 * - `MCP_SERVICE_TOKEN` no ambiente (token de autenticação server-to-server)
 *
 * @param userId  ID do usuário da plataforma (nunca número de WhatsApp).
 */
export async function createMcpSession(userId: string): Promise<McpSession> {
  const mcpUrl = process.env.MCP_URL;
  if (!mcpUrl) {
    throw new Error(
      "MCP_URL não configurado , defina a variável de ambiente antes de usar o agente.",
    );
  }

  const serviceToken = process.env.MCP_SERVICE_TOKEN ?? "";

  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        "x-mcp-user-id": userId,
      },
    },
  });

  const client = new Client(
    { name: "nexus-odoo-agent", version: "1.0.0" },
    { capabilities: {} },
  );

  await client.connect(transport);

  return {
    async listTools(): Promise<McpTool[]> {
      const result = await client.listTools();
      return (result.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description ?? "",
        inputSchema: (t.inputSchema as Record<string, unknown>) ?? { type: "object", properties: {} },
      }));
    },

    async callTool(name: string, args: Record<string, unknown>): Promise<string> {
      const result = await client.callTool({ name, arguments: args });
      return normalizeMcpResult(
        result as { content?: Array<{ type: string; text?: string }> },
      );
    },

    async close(): Promise<void> {
      await client.close();
    },
  };
}
