// src/worker/fatos/fato-build-state.ts
import type { PrismaClient } from "../../generated/prisma/client";

/** Registra que o builder de um fato acabou de rodar. */
export async function markFatoBuilt(
  prisma: PrismaClient,
  fato: string,
): Promise<void> {
  const now = new Date();
  await prisma.fatoBuildState.upsert({
    where: { fato },
    create: { fato, ultimoBuildAt: now },
    update: { ultimoBuildAt: now },
  });
}
