// src/worker/fatos/fato-estoque-saldo.ts
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";

export interface FatoSaldoRow {
  odooSaldoId: number;
  produtoId: number | null;
  produtoNome: string | null;
  localId: number | null;
  localNome: string | null;
  quantidade: number;
  unidade: string | null;
}

export function mapSaldoRow(raw: Record<string, unknown>): FatoSaldoRow {
  return {
    odooSaldoId: Number(raw.id),
    produtoId: relId(raw.produto_id as OdooM2O),
    produtoNome: relNome(raw.produto_id as OdooM2O),
    localId: relId(raw.local_id as OdooM2O),
    localNome: relNome(raw.local_id as OdooM2O),
    quantidade: Number(raw.saldo ?? 0),
    unidade: relNome(raw.unidade_id as OdooM2O),
  };
}

/** Reconstrói fato_estoque_saldo a partir de raw_estoque_saldo_hoje. */
export async function rebuildFatoEstoqueSaldo(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawEstoqueSaldoHoje.findMany({ where: { rawDeleted: false } });
  const mapped = rawRows.map((r) => mapSaldoRow(r.data as Record<string, unknown>));
  await prisma.$transaction(async (tx) => {
    await tx.fatoEstoqueSaldo.deleteMany({});
    if (mapped.length) {
      await tx.fatoEstoqueSaldo.createMany({
        data: mapped.map((m) => ({ ...m, atualizadoEm: new Date() })),
      });
    }
  });
  return mapped.length;
}
