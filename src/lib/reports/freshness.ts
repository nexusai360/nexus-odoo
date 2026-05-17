import type { PrismaClient } from "@/generated/prisma/client";
import type { ReportEntry } from "./types";

/**
 * Freshness de um relatório = o menor instante entre o último snapshot do
 * modelo-fonte e o último build de cada fato das seções. O dado é tão fresco
 * quanto a etapa mais atrasada. null se algum fato nunca foi construído.
 */
export async function reportFreshness(
  prisma: PrismaClient,
  entry: ReportEntry,
): Promise<Date | null> {
  const sync = await prisma.syncState.findUnique({
    where: { model: entry.modeloFonte },
    select: { lastSnapshotAt: true },
  });
  const candidatos: Date[] = [];
  if (sync?.lastSnapshotAt) candidatos.push(sync.lastSnapshotAt);

  const fatos = [...new Set(entry.secoes.map((s) => s.fato))];
  for (const fato of fatos) {
    const build = await prisma.fatoBuildState.findUnique({
      where: { fato },
      select: { ultimoBuildAt: true },
    });
    if (!build) return null; // fato nunca construído
    candidatos.push(build.ultimoBuildAt);
  }
  if (candidatos.length === 0) return null;
  return candidatos.reduce((min, d) => (d < min ? d : min));
}
