// scripts/f4l-ingest.ts
// Carga de ingestão one-shot da fase F4 L1: roda um ciclo de snapshot completo
// contra o Odoo de produção (leitura) populando todas as tabelas raw_* do
// MODEL_CATALOG, inclusive os modelos novos da Onda L1a.
// Uso: tsx --env-file=.env.local scripts/f4l-ingest.ts
import { prisma } from "../src/worker/prisma";
import { clientFromEnv } from "../src/worker/odoo/client";
import { MODEL_CATALOG } from "../src/worker/catalog/model-catalog";
import { processIncrementalCycle, processSnapshotCycle } from "../src/worker/sync/processors";

async function main(): Promise<void> {
  const client = clientFromEnv();
  await client.authenticate();
  const inicio = Date.now();
  console.log(`[ingest] snapshot — ${MODEL_CATALOG.length} modelos`);
  await processSnapshotCycle({ prisma, client }, MODEL_CATALOG);
  console.log(`[ingest] snapshot ok (${((Date.now() - inicio) / 1000).toFixed(0)}s)`);
  console.log(`[ingest] incremental (carga fria — pull completo)`);
  await processIncrementalCycle({ prisma, client }, MODEL_CATALOG);
  console.log(`[ingest] incremental ok — total ${((Date.now() - inicio) / 1000).toFixed(0)}s`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[ingest] FALHA:", err);
  process.exit(1);
});
