// src/worker/fatos/fato-build-state.ts
import type { PrismaClient } from "../../generated/prisma/client";

/**
 * Cliente capaz de gravar o estado de build. Aceita tanto o `PrismaClient`
 * quanto o cliente transacional passado a `prisma.$transaction(tx => …)`,
 * permitindo commitar o estado de build junto com os dados do fato.
 */
export type FatoBuildStateClient = Pick<PrismaClient, "fatoBuildState">;

/** Registra que o builder de um fato acabou de rodar. */
export async function markFatoBuilt(
  client: FatoBuildStateClient,
  fato: string,
): Promise<void> {
  const now = new Date();
  await client.fatoBuildState.upsert({
    where: { fato },
    create: { fato, ultimoBuildAt: now },
    update: { ultimoBuildAt: now },
  });
}
