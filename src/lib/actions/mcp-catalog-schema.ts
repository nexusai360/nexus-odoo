"use server";

/**
 * Server Action: exporta o catálogo serializável de tools do MCP.
 *
 * Fonte do catálogo: o snapshot in-app `src/lib/mcp-catalog-snapshot.json`,
 * gerado por `scripts/gen-mcp-catalog-snapshot.ts` (`npm run gen:mcp-catalog`)
 * a partir do catálogo do código do servidor MCP. A documentação não depende
 * mais do container `mcp` estar no ar, em dev ele não roda, e antes o catálogo
 * aparecia vazio ("0 tools").
 *
 * Gate: super_admin.
 */

import { requireSuperAdmin } from "@/lib/actions/_helpers";
import catalogSnapshot from "@/lib/mcp-catalog-snapshot.json";

// ──────────────────────────────────────────────────────────────────────────────
// Tipo do snapshot (espelha CatalogSchemaToolItem do endpoint MCP).
// ──────────────────────────────────────────────────────────────────────────────

interface McpEndpointToolItem {
  id: string;
  operation: "read" | "write";
  module: string;
  descricao: string;
  capability: string | null;
  sensitive: boolean;
  addedInVersion: number | null;
  inputSchemaKeys: string[];
  examples: ReadonlyArray<{ language: string; description?: string; code: string }>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Types serializáveis (sem functions, sem Zod)
// ──────────────────────────────────────────────────────────────────────────────

export interface CatalogToolItem {
  id: string;
  operation: "read" | "write";
  /** Domínio de negócio (ex: "estoque", "financeiro", "crm"). */
  module: string;
  descricao: string;
  /** Capability necessária (ex: "crm.create"). Apenas write tools. */
  capability: string | null;
  /** Se true, badge "Sensível" exibido na documentação. */
  sensitive: boolean;
  addedInVersion: number | null;
  inputSchemaKeys: string[];
  examples: ReadonlyArray<{
    language: string;
    description?: string;
    code: string;
  }>;
}

export interface CatalogByModule {
  module: string;
  readTools: CatalogToolItem[];
  writeTools: CatalogToolItem[];
}

export type CatalogSchemaResult =
  | { success: true; data: CatalogByModule[]; unavailable?: true }
  | { success: false; error: string };

// ──────────────────────────────────────────────────────────────────────────────
// Agrupamento por módulo (pura, testável isoladamente)
// ──────────────────────────────────────────────────────────────────────────────

/** Agrupa as tools do snapshot por módulo, separando leitura e escrita. */
export async function groupCatalogTools(
  tools: McpEndpointToolItem[],
): Promise<CatalogByModule[]> {
  const byModule = new Map<string, CatalogByModule>();

  function getOrCreate(module: string): CatalogByModule {
    let entry = byModule.get(module);
    if (!entry) {
      entry = { module, readTools: [], writeTools: [] };
      byModule.set(module, entry);
    }
    return entry;
  }

  for (const tool of tools) {
    const item: CatalogToolItem = {
      id: tool.id,
      operation: tool.operation,
      module: tool.module,
      descricao: tool.descricao,
      capability: tool.capability,
      sensitive: tool.sensitive,
      addedInVersion: tool.addedInVersion,
      inputSchemaKeys: tool.inputSchemaKeys,
      examples: tool.examples,
    };

    const mod = getOrCreate(tool.module);
    if (tool.operation === "write") {
      mod.writeTools.push(item);
    } else {
      mod.readTools.push(item);
    }
  }

  return Array.from(byModule.values())
    .sort((a, b) => a.module.localeCompare(b.module))
    .map((m) => ({
      ...m,
      readTools: [...m.readTools].sort((a, b) => a.id.localeCompare(b.id)),
      writeTools: [...m.writeTools].sort((a, b) => a.id.localeCompare(b.id)),
    }));
}

// ──────────────────────────────────────────────────────────────────────────────
// getMcpCatalogSchema
// ──────────────────────────────────────────────────────────────────────────────

export async function getMcpCatalogSchema(): Promise<CatalogSchemaResult> {
  try {
    await requireSuperAdmin();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const snapshot = catalogSnapshot as { tools: McpEndpointToolItem[] };
  const tools = Array.isArray(snapshot.tools) ? snapshot.tools : [];
  const data = await groupCatalogTools(tools);

  if (data.length === 0) {
    return { success: true, data: [], unavailable: true };
  }

  return { success: true, data };
}
