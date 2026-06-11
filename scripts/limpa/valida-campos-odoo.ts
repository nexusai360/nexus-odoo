/**
 * scripts/limpa/valida-campos-odoo.ts , T3 do plan Limpa 2026+ (read-only).
 *
 * Para cada modelo com `corte` no MODEL_CATALOG, prova que o campo e
 * filtravel no Odoo (search_count com a clausula) e mede o universo 2026 na
 * fonte. Falha (exit 1) se algum campo nao for filtravel.
 *
 * Uso: npx tsx --env-file=.env.local scripts/limpa/valida-campos-odoo.ts
 */
import { clientFromEnv } from "@/worker/odoo/client";
import { MODEL_CATALOG } from "@/worker/catalog/model-catalog";
import { CORTE_DADOS_ISO } from "@/worker/sync/corte";

async function main() {
  const odoo = clientFromEnv("read");
  await odoo.authenticate();
  let falhas = 0;
  for (const e of MODEL_CATALOG) {
    if (!e.corte) continue;
    try {
      const total = (await odoo.searchIds(e.odooModel, [])).length;
      const de2026 = (await odoo.searchIds(e.odooModel, [[e.corte.odoo, ">=", CORTE_DADOS_ISO]])).length;
      console.log(`OK  ${e.odooModel.padEnd(28)} campo=${e.corte.odoo.padEnd(18)} total=${total} 2026+=${de2026} (pre-2026=${total - de2026})`);
    } catch (err) {
      falhas++;
      console.log(`XX  ${e.odooModel.padEnd(28)} campo=${e.corte.odoo} ERRO: ${String(err).slice(0, 140)}`);
    }
  }
  process.exit(falhas ? 1 : 0);
}
main().catch((e) => { console.error(String(e).slice(0, 200)); process.exit(1); });
