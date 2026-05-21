"use server";

/**
 * Server Action: exporta catálogo serializável de tools do MCP.
 *
 * Importa o catálogo real de mcp/catalog/index via path relativo.
 * Serializa apenas os campos seguros (sem handlers, sem schemas Zod).
 *
 * Abordagem: import relativo cross-boundary funciona — confirmado por
 * src/lib/reports/queries/financeiro.ts e paridade.test.ts.
 *
 * Gate: super_admin.
 */

import { requireSuperAdmin } from "@/lib/actions/_helpers";
import { catalogo } from "../../../mcp/catalog/index";
import { isWriteToolEntry } from "../../../mcp/catalog/types";
import type { ToolEntryExample } from "../../../mcp/catalog/types";

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
  examples: ReadonlyArray<ToolEntryExample>;
}

export interface CatalogByModule {
  module: string;
  readTools: CatalogToolItem[];
  writeTools: CatalogToolItem[];
}

export type CatalogSchemaResult =
  | { success: true; data: CatalogByModule[] }
  | { success: false; error: string };

// ──────────────────────────────────────────────────────────────────────────────
// getMcpCatalogSchema
// ──────────────────────────────────────────────────────────────────────────────

export async function getMcpCatalogSchema(): Promise<CatalogSchemaResult> {
  try {
    await requireSuperAdmin();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const byModule = new Map<string, CatalogByModule>();

  function getOrCreate(module: string): CatalogByModule {
    let entry = byModule.get(module);
    if (!entry) {
      entry = { module, readTools: [], writeTools: [] };
      byModule.set(module, entry);
    }
    return entry;
  }

  for (const entry of catalogo) {
    if (isWriteToolEntry(entry)) {
      const mod = getOrCreate(entry.module);
      mod.writeTools.push({
        id: entry.id,
        operation: "write",
        module: entry.module,
        descricao: entry.descricao,
        capability: `${entry.capability.module}.${entry.capability.action}`,
        sensitive: entry.sensitive,
        addedInVersion: entry.addedInVersion ?? null,
        examples: entry.examples ?? [],
      });
    } else {
      // read tool — dominio pode ser undefined (caminho3 / sempreVisivel)
      const module = entry.dominio ?? "outros";
      // Excluir tools de domínio-neutro do catálogo público (registrar_lacuna, bi_consulta_avancada)
      if (entry.sempreVisivel) continue;
      const mod = getOrCreate(module);
      mod.readTools.push({
        id: entry.id,
        operation: "read",
        module,
        descricao: entry.descricao,
        capability: null,
        sensitive: false,
        addedInVersion: entry.addedInVersion ?? null,
        examples: entry.examples ?? [],
      });
    }
  }

  // Sort modules alphabetically, tools within module by id
  const result: CatalogByModule[] = Array.from(byModule.values())
    .sort((a, b) => a.module.localeCompare(b.module))
    .map((m) => ({
      ...m,
      readTools: [...m.readTools].sort((a, b) => a.id.localeCompare(b.id)),
      writeTools: [...m.writeTools].sort((a, b) => a.id.localeCompare(b.id)),
    }));

  return { success: true, data: result };
}
