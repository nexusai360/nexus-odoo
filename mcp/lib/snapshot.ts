// mcp/lib/snapshot.ts
// Utilitário para truncar valores string grandes em snapshots antes de
// persisti-los no McpAuditLog, evitando linhas gigantescas no banco.

/** Limite máximo de caracteres por campo string no snapshot. */
const MAX_STRING_BYTES = 10 * 1024; // 10 KB

/**
 * Trunca campos string no objeto snapshot que excedam MAX_STRING_BYTES.
 * O sufixo `...[truncated:<original_size>]` preserva o tamanho original
 * para fins de diagnóstico.
 *
 * - Não muta o objeto original (shallow copy).
 * - Não processa campos aninhados (flat snapshot).
 * - Campos não-string são preservados intactos.
 */
export function truncateSnapshot<T extends Record<string, unknown>>(snapshot: T): T {
  const out = { ...snapshot } as Record<string, unknown>;
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === "string" && v.length > MAX_STRING_BYTES) {
      out[k] = `${v.slice(0, MAX_STRING_BYTES)}...[truncated:${v.length}]`;
    }
  }
  return out as T;
}
