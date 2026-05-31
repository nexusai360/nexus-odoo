// B1 (onda contábil): builder do cabeçalho do lançamento contábil. Estrutural
// (0 reg hoje; popula quando a Matrix operar contabilidade no Odoo).
// Fonte: raw_contabil_lancamento (modelo contabil.lancamento).
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";

export interface FatoContabilLancamentoRow {
  odooId: number;
  codigo: string | null;
  tipo: string | null;
  dataLancamento: Date | null;
  valor: number;
  valorDebito: number;
  valorCredito: number;
  empresaId: number | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number => (typeof v === "number" ? v : 0);
const dt = (v: unknown): Date | null =>
  typeof v === "string" && v ? new Date(v.replace(" ", "T")) : null;

export function mapContabilLancamentoRow(raw: Record<string, unknown>): FatoContabilLancamentoRow {
  return {
    odooId: Number(raw.id),
    codigo: str(raw.codigo),
    // CONFIRMAR na ativação: tipo é selection N/E/X (Normal/Encerramento/Extemporâneo).
    tipo: str(raw.tipo),
    dataLancamento: dt(raw.data_lancamento),
    valor: num(raw.valor),
    valorDebito: num(raw.valor_debito),
    valorCredito: num(raw.valor_credito),
    empresaId: relId(raw.empresa_id as OdooM2O),
  };
}

export async function rebuildFatoContabilLancamento(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawContabilLancamento.findMany({
    where: { rawDeleted: false },
  });
  const mapped = rawRows.map((r) => mapContabilLancamentoRow(r.data as Record<string, unknown>));

  await prisma.$transaction(
    async (tx) => {
      await tx.fatoContabilLancamento.deleteMany({});
      if (mapped.length) {
        await tx.fatoContabilLancamento.createMany({ data: mapped });
      }
      await markFatoBuilt(tx, "fato_contabil_lancamento");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );

  return mapped.length;
}
