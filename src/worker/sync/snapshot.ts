// src/worker/sync/snapshot.ts
import type { OdooClient } from "../odoo/client";

function parseWriteDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Full refresh: apaga a tabela raw inteira e recria, numa transação.
 * `rawTableKey` é a propriedade do client Prisma (ex.: "rawEstoqueSaldoHoje").
 */
export async function syncSnapshot(
  client: OdooClient,
  prisma: { $transaction: <T>(fn: (tx: Record<string, never>) => Promise<T>) => Promise<T> },
  rawTableKey: string,
  odooModel: string,
): Promise<number> {
  const records = (await client.searchReadPaged(odooModel, [])) as Record<string, unknown>[];
  const now = new Date();
  const rows = records.map((rec) => ({
    odooId: Number(rec.id),
    data: rec,
    odooWriteDate: parseWriteDate(rec.write_date),
    syncedAt: now,
  }));
  await prisma.$transaction(async (tx) => {
    const raw = (tx as Record<string, { deleteMany: Function; createMany: Function }>)[rawTableKey];
    await raw.deleteMany({});
    if (rows.length) await raw.createMany({ data: rows });
  });
  return rows.length;
}
