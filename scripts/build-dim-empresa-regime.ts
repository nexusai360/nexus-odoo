#!/usr/bin/env tsx
/**
 * Popula `dim_empresa_regime` (de-para CNPJ-raiz -> regime tributario) por leitura
 * direcionada de `sped.empresa.regime_tributario`. Idempotente (upsert por raiz).
 *
 *   npx tsx --env-file=.env.local scripts/build-dim-empresa-regime.ts
 */
import { prisma } from "@/lib/prisma";
import { clientFromEnv } from "@/worker/odoo/client";
import { rebuildDimEmpresaRegime } from "@/worker/fatos/dim-empresa-regime";

async function main() {
  const odoo = clientFromEnv("read");
  await odoo.authenticate();
  const n = await rebuildDimEmpresaRegime(prisma, odoo);
  console.log(`dim_empresa_regime populado: ${n} raizes`);
  const rows = await prisma.dimEmpresaRegime.findMany({ orderBy: { cnpjRaiz: "asc" } });
  for (const r of rows) console.log(`  ${r.cnpjRaiz} -> ${r.regimeCodigo} (${r.regimeLabel})`);
  await prisma.$disconnect();
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
