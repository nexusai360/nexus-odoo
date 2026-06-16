// src/worker/fatos/fato-apuracao.ts
// FONTE: raw_sped_apuracao (modelo sped.apuracao).
// ESCOPO: apurações fiscais (ICMS-IPI e PIS-COFINS) da Matrix Fitness Group.
// CYCLE: incremental , volume baixo (~8 apurações).
import type { PrismaClient } from "../../generated/prisma/client";
import { relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";

export interface FatoApuracaoRow {
  odooId: number;
  empresaNome: string | null;
  dataInicial: Date | null;
  dataFinal: Date | null;
  tipo: string | null;
  entregue: boolean;
  regimeTributario: string | null;
  vrIcmsARecolher: number;
  vrIcmsSaldoCredor: number;
  vrIpiARecolher: number;
  vrPisARecolher: number;
  vrCofinsARecolher: number;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function dateOrNull(v: unknown): Date | null {
  if (typeof v !== "string" || v.length < 8) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function mapApuracaoRow(raw: Record<string, unknown>): FatoApuracaoRow {
  return {
    odooId: Number(raw.id),
    empresaNome: relNome(raw.empresa_id as OdooM2O),
    dataInicial: dateOrNull(raw.data_inicial),
    dataFinal: dateOrNull(raw.data_final),
    tipo: typeof raw.tipo === "string" && raw.tipo.length > 0 ? raw.tipo : null,
    entregue: raw.entregue === true,
    regimeTributario:
      typeof raw.regime_tributario === "string" && raw.regime_tributario.length > 0
        ? raw.regime_tributario
        : null,
    vrIcmsARecolher: num(raw.vr_icms_proprio_a_recolher),
    vrIcmsSaldoCredor: num(raw.vr_icms_proprio_saldo_credor),
    vrIpiARecolher: num(raw.vr_ipi_a_recolher),
    vrPisARecolher: num(raw.vr_pis_proprio_a_recolher),
    vrCofinsARecolher: num(raw.vr_cofins_proprio_a_recolher),
  };
}

/** Reconstrói fato_apuracao a partir de raw_sped_apuracao. */
export async function rebuildFatoApuracao(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawSpedApuracao.findMany({
    where: { rawDeleted: false },
  });
  const mapped = rawRows.map((r) => mapApuracaoRow(r.data as Record<string, unknown>));
  await prisma.$transaction(
    async (tx) => {
      await tx.fatoApuracao.deleteMany({});
      if (mapped.length) {
        await tx.fatoApuracao.createMany({ data: mapped });
      }
      await markFatoBuilt(tx, "fato_apuracao");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );
  return mapped.length;
}
