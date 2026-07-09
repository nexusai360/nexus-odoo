// src/lib/reports/builder/freshness-builder.ts
// Freshness de um relatorio do construtor = o menor ultimo build entre os fatos das
// secoes (o dado e tao fresco quanto a etapa mais atrasada). null se algum fato nunca
// foi construido. Alimenta o "atualizado ha Xs" do render (decisao canonica #2).
import { prisma } from "@/lib/prisma";
import type { BuilderReportEntry } from "./types";

export async function freshnessDoEntry(entry: BuilderReportEntry): Promise<Date | null> {
  const fatos = [...new Set(entry.secoes.map((s) => s.fato))];
  if (fatos.length === 0) return null;
  const builds = await prisma.fatoBuildState.findMany({
    where: { fato: { in: fatos } },
    select: { fato: true, ultimoBuildAt: true },
  });
  if (builds.length < fatos.length) return null; // algum fato nunca construido
  return builds.reduce<Date | null>(
    (min, b) => (min === null || b.ultimoBuildAt < min ? b.ultimoBuildAt : min),
    null,
  );
}
