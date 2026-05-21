"use server";

/**
 * Server Action: exporta catálogo serializável de tools do MCP.
 *
 * Busca o catálogo via GET ${MCP_URL}/api/mcp/catalog-schema — endpoint público
 * do container MCP. Nunca importa código do container mcp/ diretamente (o Turbopack
 * não resolve imports .js→.ts cross-boundary).
 *
 * Fallback gracioso: se MCP_URL não estiver configurado ou o serviço estiver
 * offline, retorna { success: true, data: [], unavailable: true }.
 *
 * Gate: super_admin.
 */

import { requireSuperAdmin } from "@/lib/actions/_helpers";

// ──────────────────────────────────────────────────────────────────────────────
// Tipo local espelhando McpEndpointToolItem do endpoint MCP.
// Definido aqui (sem import cross-boundary) para não quebrar o Turbopack.
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
// getMcpCatalogSchema
// ──────────────────────────────────────────────────────────────────────────────

/** URL base do container MCP (env configurada no .env.example). */
function getMcpUrl(): string | null {
  const url = process.env.MCP_URL;
  return url && url.trim() !== "" ? url.trim().replace(/\/$/, "") : null;
}

export async function getMcpCatalogSchema(): Promise<CatalogSchemaResult> {
  try {
    await requireSuperAdmin();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const mcpUrl = getMcpUrl();

  if (!mcpUrl) {
    // MCP_URL não configurado — catálogo indisponível (dev sem container MCP)
    return { success: true, data: [], unavailable: true };
  }

  let tools: McpEndpointToolItem[];
  try {
    const res = await fetch(`${mcpUrl}/api/mcp/catalog-schema`, {
      method: "GET",
      headers: { Accept: "application/json" },
      // Next.js 15+: sem cache no SSR para garantir dados frescos
      cache: "no-store",
    });

    if (!res.ok) {
      return { success: true, data: [], unavailable: true };
    }

    const json = (await res.json()) as { tools?: McpEndpointToolItem[]; count?: number };
    tools = Array.isArray(json.tools) ? json.tools : [];
  } catch {
    // Container MCP offline ou timeout
    return { success: true, data: [], unavailable: true };
  }

  // Agrupar por módulo (excluindo tools sempreVisivel sem módulo explícito — "outros")
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

  // Sort módulos alfabeticamente, tools dentro do módulo por id
  const result: CatalogByModule[] = Array.from(byModule.values())
    .sort((a, b) => a.module.localeCompare(b.module))
    .map((m) => ({
      ...m,
      readTools: [...m.readTools].sort((a, b) => a.id.localeCompare(b.id)),
      writeTools: [...m.writeTools].sort((a, b) => a.id.localeCompare(b.id)),
    }));

  return { success: true, data: result };
}
