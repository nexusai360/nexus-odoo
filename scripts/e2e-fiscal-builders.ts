// scripts/e2e-fiscal-builders.ts — usado apenas no C.13 E2E; deletar após a verificação.
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { rebuildFatoNotaFiscal } from "../src/worker/fatos/fato-nota-fiscal.ts";
import { rebuildFatoNotaFiscalItem } from "../src/worker/fatos/fato-nota-fiscal-item.ts";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== Builder fato_nota_fiscal ===");
  const t1 = Date.now();
  const n1 = await rebuildFatoNotaFiscal(prisma);
  const ms1 = Date.now() - t1;
  console.log(`fato_nota_fiscal: ${n1} linhas em ${ms1}ms`);

  console.log("\n=== Builder fato_nota_fiscal_item (211k linhas esperadas) ===");
  const t2 = Date.now();
  const n2 = await rebuildFatoNotaFiscalItem(prisma);
  const ms2 = Date.now() - t2;
  console.log(`fato_nota_fiscal_item: ${n2} linhas em ${ms2}ms (${(ms2 / 1000).toFixed(1)}s)`);

  // SELECT direto para comparação
  const countNf = await prisma.fatoNotaFiscal.count();
  const countNfi = await prisma.fatoNotaFiscalItem.count();
  console.log(`\n=== SELECT de confirmação ===`);
  console.log(`fato_nota_fiscal.count(): ${countNf}`);
  console.log(`fato_nota_fiscal_item.count(): ${countNfi}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
