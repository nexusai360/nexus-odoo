// mcp/catalog/schema-endpoint.ts
// Handler GET /api/mcp/catalog-schema — endpoint público de metadados do catálogo.
//
// Retorna um JSON serializável com os campos de cada tool do catálogo:
// { id, module, operation, descricao, capability, sensitive, addedInVersion, inputSchemaKeys, examples }
//
// SEM autenticação — é apenas metadado público (equivalente a /health).
// Não expõe handlers, schemas Zod ou qualquer dado operacional.

import type * as http from "node:http";
import type { ToolEntry, WriteToolEntry } from "./types.js";
import { isWriteToolEntry } from "./types.js";

// ─── Tipos do response ────────────────────────────────────────────────────────

export interface CatalogSchemaToolItem {
  id: string;
  operation: "read" | "write";
  module: string;
  descricao: string;
  /** Capability serializada ("module.action"). Apenas write tools; null para reads. */
  capability: string | null;
  sensitive: boolean;
  addedInVersion: number | null;
  /** Nomes das chaves do inputSchemaShape (não o schema Zod, apenas as chaves). */
  inputSchemaKeys: string[];
  examples: ReadonlyArray<{
    language: string;
    description?: string;
    code: string;
  }>;
}

export interface CatalogSchemaResponse {
  tools: CatalogSchemaToolItem[];
  count: number;
  generatedAt: string;
}

// ─── Serializador ────────────────────────────────────────────────────────────

export function serializeCatalog(
  catalog: ReadonlyArray<ToolEntry | WriteToolEntry>,
): CatalogSchemaResponse {
  const tools: CatalogSchemaToolItem[] = [];

  for (const entry of catalog) {
    if (isWriteToolEntry(entry)) {
      tools.push({
        id: entry.id,
        operation: "write",
        module: entry.module,
        descricao: entry.descricao,
        capability: `${entry.capability.action}:${entry.capability.module}`,
        sensitive: entry.sensitive,
        addedInVersion: entry.addedInVersion ?? null,
        inputSchemaKeys: Object.keys(entry.inputSchemaShape),
        examples: entry.examples ?? [],
      });
    } else {
      // read tool — dominio pode ser ausente (sempreVisivel / caminho3)
      tools.push({
        id: entry.id,
        operation: "read",
        module: entry.dominio ?? "outros",
        descricao: entry.descricao,
        capability: null,
        sensitive: false,
        addedInVersion: entry.addedInVersion ?? null,
        inputSchemaKeys: Object.keys(entry.inputSchemaShape),
        examples: entry.examples ?? [],
      });
    }
  }

  return {
    tools,
    count: tools.length,
    generatedAt: new Date().toISOString(),
  };
}

// ─── HTTP handler ─────────────────────────────────────────────────────────────

/**
 * Handler para GET /api/mcp/catalog-schema.
 * Responde com JSON serializável do catálogo — sem auth, sem handlers Zod.
 */
export function handleCatalogSchemaRequest(
  res: http.ServerResponse,
  catalog: ReadonlyArray<ToolEntry | WriteToolEntry>,
): void {
  const payload = serializeCatalog(catalog);
  const body = JSON.stringify(payload);
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=60",
  });
  res.end(body);
}
