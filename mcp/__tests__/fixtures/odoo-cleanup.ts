// mcp/__tests__/fixtures/odoo-cleanup.ts
// Fixture de cleanup de parceiros criados no Odoo real durante testes E2E.
// Usada apenas quando ODOO_WRITE_USER/ODOO_WRITE_PASSWORD estão presentes.
//
// Uso:
//   await cleanupPartnersByPrefix(odoo, "[MCP-TEST]");

import type { OdooClient } from "@/worker/odoo/client.js";

/**
 * Busca todos os parceiros no Odoo cujo nome começa com `prefix` e os deleta
 * via `unlink` em lote.
 *
 * Silencia erros individuais de unlink (ex.: registro já deletado).
 * Logs de warning emitidos via console.warn.
 */
export async function cleanupPartnersByPrefix(
  odoo: OdooClient,
  prefix: string,
): Promise<{ found: number; deleted: number }> {
  let ids: number[] = [];

  try {
    ids = await odoo.searchIds("res.partner", [["name", "like", `${prefix}%`]]);
  } catch (err) {
    console.warn(`[odoo-cleanup] searchIds failed for prefix "${prefix}":`, err);
    return { found: 0, deleted: 0 };
  }

  if (ids.length === 0) {
    return { found: 0, deleted: 0 };
  }

  let deleted = 0;
  try {
    await odoo.unlink("res.partner", ids);
    deleted = ids.length;
  } catch (err) {
    console.warn(
      `[odoo-cleanup] unlink failed for ${ids.length} partners (prefix "${prefix}"):`,
      err,
    );
    // Tentar um por um como fallback
    for (const id of ids) {
      try {
        await odoo.unlink("res.partner", [id]);
        deleted++;
      } catch {
        // Ignorar — pode já ter sido deletado
      }
    }
  }

  return { found: ids.length, deleted };
}
