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

/**
 * Grava a métrica do build (duração + linhas) e marca o fato como VERIFICADO
 * agora. Chamado por `runBuilders` FORA da transação do builder (o builder já
 * commitou seu `markFatoBuilt`), por isso é um update separado. `updateMany`
 * (não `update`) para não estourar se a linha não existir , ex.: builder que
 * falhou antes de chamar `markFatoBuilt`. Best-effort: nunca derruba o ciclo.
 */
export async function registrarMetricaBuild(
  client: FatoBuildStateClient,
  fato: string,
  ms: number,
  linhas: number | null,
): Promise<void> {
  await client.fatoBuildState.updateMany({
    where: { fato },
    data: {
      ultimoVerificadoAt: new Date(),
      ultimoBuildMs: ms,
      ultimasLinhas: linhas,
    },
  });
}
