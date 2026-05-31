// B1 (onda contábil): builder do plano REFERENCIAL SPED (de-para fiscal).
// Fonte: raw_contabil_conta_referencial (modelo contabil.conta.referencial, 2216
// reg reais). Distinto do fato_conta_contabil (plano de contas da empresa).
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";

export interface FatoContabilContaReferencialRow {
  odooId: number;
  codigo: string;
  nome: string | null;
  nomeCompleto: string | null;
  natureza: string | null;
  tipo: string | null;
  nivel: number | null;
  parentPath: string | null;
  contaSuperiorId: number | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export function mapContabilContaReferencialRow(
  raw: Record<string, unknown>,
): FatoContabilContaReferencialRow {
  return {
    odooId: Number(raw.id),
    codigo: typeof raw.codigo === "string" ? raw.codigo : "",
    nome: str(raw.nome),
    nomeCompleto: str(raw.nome_completo),
    natureza: str(raw.natureza),
    tipo: str(raw.tipo),
    nivel: typeof raw.nivel === "number" ? raw.nivel : null,
    parentPath: str(raw.parent_path),
    contaSuperiorId: relId(raw.conta_superior_id as OdooM2O),
  };
}

export async function rebuildFatoContabilContaReferencial(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawContabilContaReferencial.findMany({
    where: { rawDeleted: false },
  });
  const mapped = rawRows.map((r) =>
    mapContabilContaReferencialRow(r.data as Record<string, unknown>),
  );

  await prisma.$transaction(
    async (tx) => {
      await tx.fatoContabilContaReferencial.deleteMany({});
      if (mapped.length) {
        await tx.fatoContabilContaReferencial.createMany({ data: mapped });
      }
      await markFatoBuilt(tx, "fato_contabil_conta_referencial");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );

  return mapped.length;
}
