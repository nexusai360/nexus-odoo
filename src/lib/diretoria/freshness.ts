import type { PrismaClient } from "@/generated/prisma/client";

/** Linha de fato_build_state que marca o FIM de um ciclo (ver worker/fatos/registry.ts). */
const MARCADOR_CICLO = "__ciclo__";

/**
 * Data ISO do ultimo ciclo de sincronizacao CONCLUIDO , ingestao mais reconstrucao de todos
 * os fatos. E o carimbo que alimenta o "atualizado ha X" e o auto-refresh das telas.
 *
 * De proposito NAO e mais `sync_state.last_incremental_at`: aquele avanca assim que o raw
 * chega do Odoo, ou seja, ANTES de os fatos serem reconstruidos. A tela se atualizava no meio
 * da reconstrucao e o usuario via KPI e grafico zerarem por alguns segundos. O marcador de
 * ciclo so aparece quando o dado ja esta inteiro.
 *
 * Enquanto o worker novo nao gravar o primeiro marcador (deploy recem-feito), cai no
 * timestamp da ingestao , o indicador nunca fica mudo.
 */
export async function ultimaSyncIso(prisma: PrismaClient): Promise<string | null> {
  const ciclo = await prisma.fatoBuildState.findUnique({
    where: { fato: MARCADOR_CICLO },
    select: { ultimoBuildAt: true },
  });
  if (ciclo?.ultimoBuildAt) return ciclo.ultimoBuildAt.toISOString();

  const r = await prisma.syncState.findFirst({
    where: { lastIncrementalAt: { not: null } },
    orderBy: { lastIncrementalAt: "desc" },
    select: { lastIncrementalAt: true },
  });
  return r?.lastIncrementalAt ? r.lastIncrementalAt.toISOString() : null;
}
