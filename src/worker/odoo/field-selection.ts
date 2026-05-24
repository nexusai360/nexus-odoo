// src/worker/odoo/field-selection.ts
import type { OdooClient } from "./client";
import { MODEL_CATALOG } from "../catalog/model-catalog";

/** Tipos de campo excluídos da sincronização (listas de filhos, redundantes). */
const EXCLUDED_TYPES = new Set(["one2many", "many2many"]);

/** Cache por modelo , fields_get é chamado no máximo uma vez por processo. */
const cache = new Map<string, string[]>();

interface FieldMeta {
  type: string;
  store: boolean;
}

/**
 * Retorna a lista de campos armazenados (store=true) do modelo, excluindo
 * one2many e many2many. Garante que `id` esteja sempre presente.
 *
 * Memoiza o resultado: chamadas subsequentes com o mesmo modelo reutilizam o
 * cache sem novo RPC ao Odoo.
 */
export async function getModelFields(
  client: OdooClient,
  model: string,
): Promise<string[]> {
  const cached = cache.get(model);
  if (cached) return cached;

  const meta = await client.executeKw<Record<string, FieldMeta>>(
    model,
    "fields_get",
    [],
    { attributes: ["type", "store"] },
  );

  const fields = Object.entries(meta)
    .filter(([, f]) => f.store === true && !EXCLUDED_TYPES.has(f.type))
    .map(([name]) => name);

  // Garante que id esteja sempre presente (pode vir como store=false em
  // alguns módulos customizados do Odoo, mas é sempre necessário).
  if (!fields.includes("id")) fields.unshift("id");

  // Exclusão por modelo: remove campos sensíveis/blobs declarados no catálogo
  // (ex.: senha e arquivo de sped.certificado). Controla só o que é copiado
  // para o nosso cache , não altera nada no Odoo.
  const exclude = MODEL_CATALOG.find((e) => e.odooModel === model)?.excludeFields;
  const finalFields =
    exclude && exclude.length ? fields.filter((f) => !exclude.includes(f)) : fields;

  cache.set(model, finalFields);
  return finalFields;
}

/** Limpa o cache em memória (útil para testes). */
export function clearFieldCache(): void {
  cache.clear();
}
