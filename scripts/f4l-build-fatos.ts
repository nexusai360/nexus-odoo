// scripts/f4l-build-fatos.ts
// Reconstrói todos os fatos (snapshot + incremental) a partir do cache raw já
// populado. Usar após a ingestão para garantir que os fatos novos da fase L1
// (fato_preco, fato_servico) sejam construídos — a ingestão one-shot pode ter
// rodado com um registry anterior ao registro deles.
// Uso: tsx --env-file=.env.local scripts/f4l-build-fatos.ts
import { prisma } from "../src/worker/prisma";
import { runBuilders } from "../src/worker/fatos/registry";

async function main(): Promise<void> {
  const inicio = Date.now();
  console.log("[fatos] reconstruindo ciclo snapshot");
  await runBuilders(prisma, "snapshot");
  console.log("[fatos] reconstruindo ciclo incremental");
  await runBuilders(prisma, "incremental");
  console.log(`[fatos] concluido em ${((Date.now() - inicio) / 1000).toFixed(0)}s`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[fatos] FALHA:", err);
  process.exit(1);
});
