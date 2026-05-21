// mcp/lib/canonical-json.ts
// Canonicalização determinística de payload para idempotência.
// Usa json-stable-stringify para garantir mesma hash independente da ordem das chaves.

import stringify from "json-stable-stringify";
import { createHash } from "node:crypto";

/**
 * Retorna o SHA-256 hex do payload canonicalizado.
 * Arrays preservam ordem. Objetos têm chaves ordenadas lexicograficamente.
 */
export function canonicalHash(payload: unknown): string {
  const canonical = stringify(payload) ?? "";
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
