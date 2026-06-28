// A6 (Diretoria): builder de seriais. Cada equipamento por número de série.
// Fonte: raw_sped_produto_lote_serie (modelo sped.produto.lote.serie).
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";
import { num } from "./_coerce";

export interface FatoSerialRow {
  odooId: number;
  serial: string | null;
  produtoId: number | null;
  produtoNome: string | null;
  localId: number | null;
  localNome: string | null;
  valorCusto: number;
  dataCompra: Date | null;
  dataSaida: Date | null;
  quantidade: number;
}

function dt(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function mapSerialRow(raw: Record<string, unknown>): FatoSerialRow {
  return {
    odooId: Number(raw.id),
    serial: raw.nome ? String(raw.nome) : null,
    produtoId: relId(raw.produto_id as OdooM2O),
    produtoNome: relNome(raw.produto_id as OdooM2O),
    localId: relId(raw.local_id as OdooM2O),
    localNome: relNome(raw.local_id as OdooM2O),
    valorCusto: num(raw.valor_custo),
    dataCompra: dt(raw.data_compra),
    // Saída = data de venda; se não houver, a baixa.
    dataSaida: dt(raw.data_venda) ?? dt(raw.data_baixa),
    quantidade: num(raw.quantidade),
  };
}

export async function rebuildFatoSerial(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawSpedProdutoLoteSerie.findMany({
    where: { rawDeleted: false },
  });
  const mapped = rawRows.map((r) => mapSerialRow(r.data as Record<string, unknown>));
  await prisma.$transaction(
    async (tx) => {
      await tx.fatoSerial.deleteMany({});
      if (mapped.length) await tx.fatoSerial.createMany({ data: mapped });
      await markFatoBuilt(tx, "fato_serial");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );
  return mapped.length;
}
