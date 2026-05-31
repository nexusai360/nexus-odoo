// B7 (CRM): builder de funis de CRM (config). Estrutural (0 reg; CRM transacional
// inexistente, ver O2). Fonte: raw_crm_pipeline (modelo crm.pipeline).
import type { PrismaClient } from "../../generated/prisma/client";
import { markFatoBuilt } from "./fato-build-state";
import { str, bool } from "./_coerce";

export interface FatoCrmPipelineRow {
  odooId: number;
  numero: number | null;
  nome: string | null;
  tipo: string | null;
  ativo: boolean;
}

export function mapCrmPipelineRow(raw: Record<string, unknown>): FatoCrmPipelineRow {
  return {
    odooId: Number(raw.id),
    numero: typeof raw.numero === "number" ? Math.trunc(raw.numero) : null,
    nome: str(raw.nome),
    tipo: str(raw.tipo),
    ativo: bool(raw.ativo),
  };
}

export async function rebuildFatoCrmPipeline(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawCrmPipeline.findMany({ where: { rawDeleted: false } });
  const mapped = rawRows.map((r) => mapCrmPipelineRow(r.data as Record<string, unknown>));
  await prisma.$transaction(
    async (tx) => {
      await tx.fatoCrmPipeline.deleteMany({});
      if (mapped.length) await tx.fatoCrmPipeline.createMany({ data: mapped });
      await markFatoBuilt(tx, "fato_crm_pipeline");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );
  return mapped.length;
}
