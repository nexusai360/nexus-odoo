// mcp/catalog/schema-endpoint.ts
// Handler GET /api/mcp/catalog-schema , endpoint público de metadados do catálogo.
//
// Retorna um JSON serializável com os campos de cada tool do catálogo:
// { id, module, operation, descricao, capability, sensitive, addedInVersion, inputSchemaKeys, examples }
//
// SEM autenticação , é apenas metadado público (equivalente a /health).
// Não expõe handlers, schemas Zod ou qualquer dado operacional.

import type * as http from "node:http";
import type { ZodRawShape, ZodTypeAny } from "zod";
import type { ToolEntry, WriteToolEntry } from "./types.js";
import { isWriteToolEntry } from "./types.js";

// ─── Tipos do response ────────────────────────────────────────────────────────

export type CatalogFieldType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "date"
  | "datetime"
  | "enum"
  | "array"
  | "object"
  | "unknown";

export interface CatalogInputField {
  name: string;
  type: CatalogFieldType;
  optional: boolean;
  enumValues?: string[];
}

export interface CatalogSchemaToolItem {
  id: string;
  operation: "read" | "write";
  module: string;
  descricao: string;
  /** Capability serializada ("action:module"). Apenas write tools; null para reads. */
  capability: string | null;
  sensitive: boolean;
  addedInVersion: number | null;
  /** Nomes das chaves do inputSchemaShape (mantido para retrocompat). */
  inputSchemaKeys: string[];
  /** Campos do input com tipo, usados para gerar placeholder semântico na doc. */
  inputSchemaFields: CatalogInputField[];
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

// ─── Extração de tipos de cada campo do input ────────────────────────────────

interface UnwrapResult {
  inner: ZodTypeAny;
  optional: boolean;
}

type ZodDefWithType = {
  type: string;
  innerType?: ZodTypeAny;
  checks?: Array<{ def?: { format?: string; check?: string }; isInt?: boolean }>;
  entries?: Record<string, string | number>;
};

function unwrapZod(t: ZodTypeAny): UnwrapResult {
  let optional = false;
  let inner: ZodTypeAny = t;
  // Iteração com guarda; tipos opcionais/nullable/default empilham wrappers.
  for (let i = 0; i < 10; i++) {
    const def = inner._def as unknown as ZodDefWithType;
    const kind = def?.type;
    if (kind === "optional" || kind === "nullable" || kind === "default" || kind === "prefault") {
      optional = true;
      const next = def.innerType;
      if (!next) break;
      inner = next;
      continue;
    }
    break;
  }
  return { inner, optional };
}

function detectFieldType(t: ZodTypeAny): { type: CatalogFieldType; enumValues?: string[] } {
  const def = t._def as unknown as ZodDefWithType;
  const kind = def?.type;
  switch (kind) {
    case "string": {
      const checks = def.checks ?? [];
      if (checks.some((c) => c.def?.format === "datetime")) return { type: "datetime" };
      if (checks.some((c) => c.def?.format === "date")) return { type: "date" };
      return { type: "string" };
    }
    case "number": {
      const checks = def.checks ?? [];
      return { type: checks.some((c) => c.isInt === true) ? "integer" : "number" };
    }
    case "boolean": return { type: "boolean" };
    case "date": return { type: "date" };
    case "enum": {
      const entries = def.entries ?? {};
      const values = Object.values(entries).filter((v): v is string => typeof v === "string");
      return { type: "enum", enumValues: values };
    }
    case "array": return { type: "array" };
    case "object": return { type: "object" };
    default: return { type: "unknown" };
  }
}

function extractInputFields(shape: ZodRawShape): CatalogInputField[] {
  const fields: CatalogInputField[] = [];
  for (const [name, raw] of Object.entries(shape)) {
    const { inner, optional } = unwrapZod(raw as ZodTypeAny);
    const { type, enumValues } = detectFieldType(inner);
    fields.push({
      name,
      type,
      optional,
      ...(enumValues ? { enumValues } : {}),
    });
  }
  return fields;
}

export function serializeCatalog(
  catalog: ReadonlyArray<ToolEntry | WriteToolEntry>,
): CatalogSchemaResponse {
  const tools: CatalogSchemaToolItem[] = [];

  for (const entry of catalog) {
    const fields = extractInputFields(entry.inputSchemaShape);
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
        inputSchemaFields: fields,
        examples: entry.examples ?? [],
      });
    } else {
      // read tool , dominio pode ser ausente (sempreVisivel / caminho3)
      tools.push({
        id: entry.id,
        operation: "read",
        module: entry.dominio ?? "outros",
        descricao: entry.descricao,
        capability: null,
        sensitive: false,
        addedInVersion: entry.addedInVersion ?? null,
        inputSchemaKeys: Object.keys(entry.inputSchemaShape),
        inputSchemaFields: fields,
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
 * Responde com JSON serializável do catálogo , sem auth, sem handlers Zod.
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
