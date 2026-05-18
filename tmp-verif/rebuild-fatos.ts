// tmp-verif/rebuild-fatos.ts
// Reconstrói todos os fatos e reporta contagens.
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { FATO_BUILDERS } from "../src/worker/fatos/registry.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== REBUILD DE FATOS ===\n");
  const resultados: { nome: string; contagem: number; erro?: string }[] = [];

  for (const builder of FATO_BUILDERS) {
    try {
      const n = await builder.run(prisma);
      console.log(`✓ ${builder.nome}: ${n} linhas`);
      resultados.push({ nome: builder.nome, contagem: n });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`✗ ${builder.nome}: ERRO — ${msg}`);
      resultados.push({ nome: builder.nome, contagem: 0, erro: msg });
    }
  }

  console.log("\n=== RESUMO ===");
  for (const r of resultados) {
    if (r.erro) {
      console.log(`  ✗ ${r.nome}: ERRO — ${r.erro}`);
    } else {
      console.log(`  ✓ ${r.nome}: ${r.contagem}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
