/**
 * Tipos e constantes exportados dos MCP API Keys — sem "use server".
 * Separado de mcp-api-keys.ts porque "use server" só pode exportar funções async.
 */

/** Módulos de negócio canônicos (discovery preenche nas ondas seguintes). */
export const MCP_MODULES = [
  "crm",
  "vendas",
  "cadastros",
  "estoque",
  "compras",
  "financeiro",
  "fiscal",
  "contabil",
  "producao",
  "rh",
  "projeto",
] as const;

export type McpModule = (typeof MCP_MODULES)[number];

/** Ações de escrita por módulo (mutação). Leitura é tratada separadamente. */
export const WRITE_ACTIONS = ["Create", "Update", "Delete", "Archive", "Transition"] as const;
export type WriteAction = (typeof WRITE_ACTIONS)[number];

/**
 * Ações consideradas sensíveis — exigem confirmação dupla na UI.
 * Baseado na spec §5.3.
 */
export const SENSITIVE_ACTIONS: WriteAction[] = ["Delete", "Transition"];

/** Capabilities serializada no campo JSON `capabilities` do ApiKey. */
export interface McpCapabilities {
  version: 1;
  read: McpModule[];
  write: Partial<Record<McpModule, WriteAction[]>>;
}

export interface McpApiKeyListItem {
  id: string;
  label: string;
  description: string | null;
  last4: string;
  capabilities: McpCapabilities;
  rateLimit: number;
  active: boolean;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  rotatedAt: Date | null;
  isSystemKey: boolean;
  tenantId: string | null;
  allowedOrigins: string[];
  createdAt: Date;
}

export interface CreatedMcpApiKey {
  id: string;
  label: string;
  token: string; // em claro — exibir 1×
  last4: string;
}
