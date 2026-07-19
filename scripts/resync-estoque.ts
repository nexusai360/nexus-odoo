// Re-sync direcionado do estoque (locais + saldos) e rebuild dos fatos.
//
// Em producao o cron do worker faz isso sozinho. No dev, quando algo muda do
// lado do Odoo (por exemplo uma permissao liberada, que passa a expor locais
// antes invisiveis), este script traz o estoque para o cache na hora, sem
// esperar o ciclo.
//
//   npx tsx --env-file=.env.local scripts/resync-estoque.ts
import { clientFromEnv } from "../src/worker/odoo/client";
import { syncSnapshot } from "../src/worker/sync/snapshot";
import { prisma } from "../src/lib/prisma";
import { rebuildFatoEstoqueLocal } from "../src/worker/fatos/fato-estoque-local";
import { rebuildFatoEstoqueSaldo } from "../src/worker/fatos/fato-estoque-saldo";

async function main() {
  const client = clientFromEnv("read");
  await client.authenticate();

  console.log("raw estoque.local:", await syncSnapshot(client, prisma as never, "rawEstoqueLocal", "estoque.local"));
  console.log("raw estoque.saldo.hoje:", await syncSnapshot(client, prisma as never, "rawEstoqueSaldoHoje", "estoque.saldo.hoje"));

  // Ordem obrigatoria: o saldo faz join na classificacao do local.
  console.log("fato_estoque_local:", await rebuildFatoEstoqueLocal(prisma as never));
  console.log("fato_estoque_saldo:", await rebuildFatoEstoqueSaldo(prisma as never));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
