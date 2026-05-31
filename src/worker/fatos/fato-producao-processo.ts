// B5 (produção): builder de processos de produção. producao.processo tem 1 reg.
// Fonte: raw_producao_processo (modelo producao.processo).
import type { PrismaClient } from "../../generated/prisma/client";
import { markFatoBuilt } from "./fato-build-state";
import { str, num } from "./_coerce";

export interface FatoProducaoProcessoRow {
  odooId: number;
  ordem: number | null;
  nome: string | null;
  descricao: string | null;
  tempo: number;
}

export function mapProducaoProcessoRow(raw: Record<string, unknown>): FatoProducaoProcessoRow {
  return {
    odooId: Number(raw.id),
    ordem: typeof raw.ordem === "number" ? Math.trunc(raw.ordem) : null,
    nome: str(raw.nome),
    descricao: str(raw.descricao),
    tempo: num(raw.tempo),
  };
}

export async function rebuildFatoProducaoProcesso(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawProducaoProcesso.findMany({ where: { rawDeleted: false } });
  const mapped = rawRows.map((r) => mapProducaoProcessoRow(r.data as Record<string, unknown>));
  await prisma.$transaction(
    async (tx) => {
      await tx.fatoProducaoProcesso.deleteMany({});
      if (mapped.length) await tx.fatoProducaoProcesso.createMany({ data: mapped });
      await markFatoBuilt(tx, "fato_producao_processo");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );
  return mapped.length;
}
