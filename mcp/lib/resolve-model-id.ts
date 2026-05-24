// mcp/lib/resolve-model-id.ts
// Resolve nome de modelo Odoo (ex: "res.partner") para o id de ir.model.
//
// Cache em memoria do processo. TTL 1h por entrada. Single-worker hoje;
// se virar multi-worker, considerar Redis.

import type { OdooClient } from "@/worker/odoo/client.js";
import { ModeloNaoSuportadoError } from "./errors.js";

interface CacheEntry {
  id: number;
  cachedAt: number;
}

const TTL_MS = 60 * 60 * 1000; // 1 hora
const cache = new Map<string, CacheEntry>();

/** Limpa cache (uso em testes). */
export function _clearResolveModelIdCache(): void {
  cache.clear();
}

/**
 * Resolve o id de `ir.model` para o nome de um modelo Odoo.
 * Lanca ModeloNaoSuportadoError se nao existir.
 */
export async function resolveModelId(
  odoo: OdooClient,
  modelName: string,
): Promise<number> {
  const cached = cache.get(modelName);
  if (cached && Date.now() - cached.cachedAt < TTL_MS) {
    return cached.id;
  }

  const rows = await odoo.searchRead<{ id: number }>(
    "ir.model",
    [["model", "=", modelName]],
    ["id"],
    { limit: 1 },
  );

  if (rows.length === 0) {
    throw new ModeloNaoSuportadoError(modelName);
  }

  const id = rows[0].id;
  cache.set(modelName, { id, cachedAt: Date.now() });
  return id;
}
