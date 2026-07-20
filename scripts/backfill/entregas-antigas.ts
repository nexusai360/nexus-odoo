/**
 * scripts/backfill/entregas-antigas.ts , CLI do back-fill dos pedidos antigos em aberto (Fase 1B).
 *
 * Shim fino: toda a logica (e os testes) vivem em src/worker/backfill/entregas-antigas.ts, que
 * o Jest cobre (jest.config roots = src/mcp). Aqui so ha o parse de --apply e o main().
 *
 * Modos:
 *   (default)  DRY-RUN: conta quantos headers/itens de pedido antigos o reconcile TRARIA.
 *              Nao escreve nada. Rode primeiro e confira as contagens.
 *   --apply    Reconcilia header -> item -> atendimento e rebuilda os fatos. IDEMPOTENTE.
 *
 * PRE-REQUISITOS (ver docs/runbooks/backfill-entregas-antigas.md, seguir a ORDEM de la):
 *   1. o override (OVERRIDE_INGESTAO em corte.ts) ja DEPLOYADO;
 *   2. o worker / ciclo incremental PARADO;
 *   3. o purge CONGELADO durante a operacao.
 *
 * Uso: npx tsx --env-file=.env.local scripts/backfill/entregas-antigas.ts [--apply]
 */
import { prisma } from "@/lib/prisma";
import { clientFromEnv } from "@/worker/odoo/client";
import { backfillEntregasAntigas } from "@/worker/backfill/entregas-antigas";

async function main() {
  const apply = process.argv.slice(2).includes("--apply");
  const client = clientFromEnv();
  await client.authenticate();
  try {
    const r = await backfillEntregasAntigas(client, prisma, { apply });
    console.log(
      `[backfill] ${apply ? "APLICADO" : "DRY-RUN"}: headers=${r.headers} ` +
        `itens=${r.itens} atendimento=${r.atendimento}`,
    );
    if (!apply) {
      console.log("[backfill] nada foi escrito. Rode de novo com --apply para aplicar.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("[backfill] falhou:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
