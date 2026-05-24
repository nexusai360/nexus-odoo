/**
 * Tipos compartilhados das Server Actions de MCPs externos , sem "use server".
 * Separado de external-mcp-servers.ts porque "use server" só exporta funções async.
 */

export type McpTransport = "http" | "sse";

export const MCP_TRANSPORTS: McpTransport[] = ["http", "sse"];

export type McpServerStatus = "ok" | "error" | "unknown";

/** Servidor MCP externo , visão para a UI. O token nunca é devolvido ao cliente. */
export interface ExternalMcpServerListItem {
  id: string;
  name: string;
  description: string | null;
  transport: string;
  url: string;
  /** true quando há token configurado , o valor em si nunca sai do servidor. */
  hasAuth: boolean;
  authHeader: string | null;
  enabled: boolean;
  lastStatus: McpServerStatus;
  lastCheckAt: Date | null;
  createdAt: Date;
}

export type DataResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };
