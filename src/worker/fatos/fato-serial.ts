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

const CHUNK = 1000;

export async function rebuildFatoSerial(prisma: PrismaClient): Promise<number> {
  // select só `data` (o registro raw completo é pesado) e insere em chunks para
  // não estourar memória , a tabela raw tem milhares de seriais.
  const rawRows = await prisma.rawSpedProdutoLoteSerie.findMany({
    where: { rawDeleted: false },
    select: { data: true },
  });
  const mapped = rawRows.map((r) => mapSerialRow(r.data as Record<string, unknown>));
  await prisma.$transaction(
    async (tx) => {
      await tx.fatoSerial.deleteMany({});
      for (let i = 0; i < mapped.length; i += CHUNK) {
        await tx.fatoSerial.createMany({ data: mapped.slice(i, i + CHUNK) });
      }
      await markFatoBuilt(tx, "fato_serial");
    },
    { timeout: 300_000, maxWait: 15_000 },
  );
  return mapped.length;
}
