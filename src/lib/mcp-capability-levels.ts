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

export type AccessLevel = "none" | "read" | "write";

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
