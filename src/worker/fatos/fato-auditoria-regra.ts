// B7 (auditoria): builder de regras de auditoria (15 reg reais).
// Fonte: raw_auditoria_regra (modelo auditoria.regra). NÃO inclui auditoria.log
// (313k) nem auditoria.log.item (14 MI) , fora de escopo do pré-build.
import type { PrismaClient } from "../../generated/prisma/client";
import { markFatoBuilt } from "./fato-build-state";
import { str, bool, num } from "./_coerce";

export interface FatoAuditoriaRegraRow {
  odooId: number;
  nome: string | null;
  ativa: boolean;
  dias: number;
}

export function mapAuditoriaRegraRow(raw: Record<string, unknown>): FatoAuditoriaRegraRow {
  return {
    odooId: Number(raw.id),
    nome: str(raw.nome),
    ativa: bool(raw.ativa),
    dias: num(raw.dias),
  };
}

export async function rebuildFatoAuditoriaRegra(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawAuditoriaRegra.findMany({ where: { rawDeleted: false } });
  const mapped = rawRows.map((r) => mapAuditoriaRegraRow(r.data as Record<string, unknown>));
  await prisma.$transaction(
    async (tx) => {
      await tx.fatoAuditoriaRegra.deleteMany({});
      if (mapped.length) await tx.fatoAuditoriaRegra.createMany({ data: mapped });
      await markFatoBuilt(tx, "fato_auditoria_regra");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );
  return mapped.length;
}
