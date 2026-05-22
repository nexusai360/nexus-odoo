// mcp/catalog/api-key-catalog.ts
// Filtro de catálogo por capability de ApiKey (auth externa).
// Análogo a visibleTools (registry.ts) mas para o modo externo:
// usa hasCapability em vez de visibleDomains + role.
import { hasCapability } from "../auth/capability-check.js";
import { isWriteToolEntry } from "./types.js";
import type { ToolEntry, WriteToolEntry } from "./types.js";
import type { ApiKeyContext } from "../auth/api-key-context.js";

/**
 * Filtra o catálogo retornando apenas as tools que a ApiKey pode ver/invocar.
 *
 * Regras:
 * - WriteToolEntry: incluída se a chave tem write capability (module + action)
 *   e o addedInVersion (se definido) não excede capabilitiesVersion.
 * - ToolEntry com dominio: incluída se a chave tem read capability para o domínio.
 * - ToolEntry sem dominio (domínio-neutro): incluída se `sempreVisivel === true`.
 */
export function visibleToolsForApiKey(
  catalog: ReadonlyArray<ToolEntry | WriteToolEntry>,
  apiKey: ApiKeyContext,
): Array<ToolEntry | WriteToolEntry> {
  return catalog.filter((tool) => {
    if (isWriteToolEntry(tool)) {
      return hasCapability(
        apiKey,
        { type: "write", module: tool.capability.module, action: tool.capability.action },
        { addedInVersion: tool.addedInVersion },
      );
    }

    // Read tool
    if (tool.dominio === undefined) {
      return tool.sempreVisivel === true;
    }

    return hasCapability(
      apiKey,
      { type: "read", module: tool.dominio },
      { addedInVersion: tool.addedInVersion },
    );
  });
}
