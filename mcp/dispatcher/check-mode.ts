// mcp/dispatcher/check-mode.ts
// Verificação de modo de autenticação para dispatch de tools.
// Decide se uma tool pode ser invocada dado o contexto de auth (internal|external).
import { hasCapability } from "../auth/capability-check.js";
import { isWriteToolEntry } from "../catalog/types.js";
import type { ToolEntry, WriteToolEntry } from "../catalog/types.js";
import type { ApiKeyContext } from "../auth/api-key-context.js";

export type ModeAuth =
  | { mode: "internal"; userId: string }
  | { mode: "external"; apiKey: ApiKeyContext };

export interface ModeCheckResult {
  allowed: boolean;
  /** Código de erro quando allowed === false. */
  errorCode?: "forbidden_via_internal_auth" | "capability_missing";
  /** Capability necessária (para capability_missing). Formato: "action:module" (write) ou "read:module". */
  required?: string;
}

/**
 * Verifica se uma tool pode ser invocada dado o modo de auth.
 *
 * Tabela de decisão:
 *
 * | tool       | auth     | resultado                                      |
 * |------------|----------|------------------------------------------------|
 * | write      | internal | denied , forbidden_via_internal_auth           |
 * | write      | external | OK se capability write presente; else denied   |
 * | read       | internal | allowed (gate de role/domínio delegado ao caller via visibleTools) |
 * | read       | external | OK se capability read presente; sempreVisivel sem domínio = livre |
 */
export function checkMode(
  tool: ToolEntry | WriteToolEntry,
  auth: ModeAuth,
): ModeCheckResult {
  // --- Write tool ---
  if (isWriteToolEntry(tool)) {
    if (auth.mode === "internal") {
      return { allowed: false, errorCode: "forbidden_via_internal_auth" };
    }

    const cap = {
      type: "write" as const,
      module: tool.capability.module,
      action: tool.capability.action,
    };

    if (!hasCapability(auth.apiKey, cap, { addedInVersion: tool.addedInVersion })) {
      return {
        allowed: false,
        errorCode: "capability_missing",
        required: `${tool.capability.action}:${tool.capability.module}`,
      };
    }

    return { allowed: true };
  }

  // --- Read tool ---

  // Auth interna: gate de role/domínio é responsabilidade do caller (visibleTools legada).
  if (auth.mode === "internal") {
    return { allowed: true };
  }

  // Auth externa: verificar capability de leitura
  if (tool.dominio === undefined) {
    // Tool de domínio-neutro: permitida apenas se sempreVisivel
    if (tool.sempreVisivel === true) {
      return { allowed: true };
    }
    return { allowed: false, errorCode: "capability_missing" };
  }

  if (!hasCapability(auth.apiKey, { type: "read", module: tool.dominio })) {
    return {
      allowed: false,
      errorCode: "capability_missing",
      required: `read:${tool.dominio}`,
    };
  }

  return { allowed: true };
}
