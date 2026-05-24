/**
 * Conversão entre o modelo de "nível de acesso por módulo" usado na UI de
 * chaves de API e a estrutura `McpCapabilities` persistida.
 *
 * A UI apresenta, por módulo, um nível claro: Sem acesso, Somente leitura, ou
 * Leitura e escrita (com as ações de escrita). Um módulo com escrita sempre
 * implica leitura.
 */

import {
  MCP_MODULES,
  type McpModule,
  type WriteAction,
  type McpCapabilities,
} from "@/lib/actions/mcp-api-keys-types";
import type { CatalogByModule } from "@/lib/actions/mcp-catalog-schema";

export type AccessLevel = "none" | "read" | "write";

/** Uma ação de escrita disponível para um módulo, derivada do catálogo. */
export interface ModuleWriteAction {
  /** Ação no formato persistido (`WriteAction`). */
  action: WriteAction;
  /** IDs das write tools que essa ação libera. */
  tools: string[];
}

/** Ações de escrita disponíveis por módulo (derivadas das write tools reais). */
export type ModuleWriteActionsMap = Partial<Record<McpModule, ModuleWriteAction[]>>;

/** Mapeia o código de ação do catálogo ("create") para o `WriteAction` persistido. */
const ACTION_CODE_TO_WRITE: Record<string, WriteAction> = {
  create: "Create",
  update: "Update",
  delete: "Delete",
  archive: "Archive",
  transition: "Transition",
};

/**
 * Deriva, a partir do catálogo serializado, quais ações de escrita cada módulo
 * realmente oferece. A UI de capabilities só mostra ações que têm write tool;
 * módulos sem write tool não têm ações de escrita.
 */
export function deriveModuleWriteActions(
  catalog: CatalogByModule[],
): ModuleWriteActionsMap {
  const map: ModuleWriteActionsMap = {};
  const modules = MCP_MODULES as readonly string[];

  for (const mod of catalog) {
    if (!modules.includes(mod.module)) continue;
    const byAction = new Map<WriteAction, string[]>();
    for (const tool of mod.writeTools) {
      // capability serializada pelo servidor MCP: "action:module" (ex.: "create:cadastros").
      // Toleramos também o legado "module.action" caso algum snapshot antigo ainda apareça.
      const raw = tool.capability ?? "";
      const code = raw.includes(":")
        ? (raw.split(":")[0] ?? "")
        : (raw.split(".").pop() ?? "");
      const writeAction = ACTION_CODE_TO_WRITE[code];
      if (!writeAction) continue;
      const arr = byAction.get(writeAction) ?? [];
      arr.push(tool.id);
      byAction.set(writeAction, arr);
    }
    if (byAction.size > 0) {
      map[mod.module as McpModule] = [...byAction.entries()].map(
        ([action, tools]) => ({ action, tools }),
      );
    }
  }
  return map;
}

export interface ModuleAccess {
  level: AccessLevel;
  actions: WriteAction[];
}

export type ModuleAccessMap = Record<McpModule, ModuleAccess>;

/** Mapa de acesso vazio: todos os módulos em "Sem acesso". */
export function emptyAccessMap(): ModuleAccessMap {
  const map = {} as ModuleAccessMap;
  for (const mod of MCP_MODULES) {
    map[mod] = { level: "none", actions: [] };
  }
  return map;
}

/** Converte `McpCapabilities` para o mapa de níveis por módulo (uso na UI). */
export function capabilitiesToLevels(cap: McpCapabilities): ModuleAccessMap {
  const map = emptyAccessMap();
  for (const mod of cap.read) {
    if (map[mod]) map[mod] = { level: "read", actions: [] };
  }
  for (const [mod, actions] of Object.entries(cap.write)) {
    const m = mod as McpModule;
    if (map[m]) {
      map[m] = { level: "write", actions: [...((actions ?? []) as WriteAction[])] };
    }
  }
  return map;
}

/** Converte o mapa de níveis de volta para `McpCapabilities` (uso na persistência). */
export function levelsToCapabilities(map: ModuleAccessMap): McpCapabilities {
  const read: McpModule[] = [];
  const write: Partial<Record<McpModule, WriteAction[]>> = {};
  for (const mod of MCP_MODULES) {
    const access = map[mod];
    if (!access || access.level === "none") continue;
    read.push(mod);
    if (access.level === "write" && access.actions.length > 0) {
      write[mod] = [...access.actions];
    }
  }
  return { version: 1, read, write };
}
