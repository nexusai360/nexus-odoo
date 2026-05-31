// B3 (cobrança bancária): builder de PIX. Estrutural (0 reg hoje; auto-ativa).
// Fonte: raw_finan_pix (modelo finan.pix).
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";
import { str, num, dt } from "./_coerce";

export interface FatoPixRow {
  odooId: number;
  txid: string | null;
  metodo: string | null;
  dataHora: Date | null;
  data: Date | null;
  status: string | null;
  vrTarifas: number;
  lancamentoId: number | null;
}

export function mapPixRow(raw: Record<string, unknown>): FatoPixRow {
  return {
    odooId: Number(raw.id),
    txid: str(raw.txid),
    metodo: str(raw.metodo),
    dataHora: dt(raw.data_hora),
    data: dt(raw.data),
    status: str(raw.status),
    vrTarifas: num(raw.vr_tarifas),
    lancamentoId: relId(raw.lancamento_id as OdooM2O),
  };
}

export async function rebuildFatoPix(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawFinanPix.findMany({ where: { rawDeleted: false } });
  const mapped = rawRows.map((r) => mapPixRow(r.data as Record<string, unknown>));
  await prisma.$transaction(
    async (tx) => {
      await tx.fatoPix.deleteMany({});
      if (mapped.length) await tx.fatoPix.createMany({ data: mapped });
      await markFatoBuilt(tx, "fato_pix");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );
  return mapped.length;
}
