// src/worker/sync/incremental.ts
import type { OdooClient } from "../odoo/client";
import { odooDatetime, parseWriteDate } from "../odoo/datetime";
import { getModelFields } from "../odoo/field-selection";

/** Interface mínima de uma tabela raw Prisma (prisma.rawXxx). */
export interface RawDelegate {
  upsert(args: {
    where: { odooId: number };
    create: RawRow;
    update: Omit<RawRow, "odooId">;
  }): Promise<unknown>;
}

interface RawRow {
  odooId: number;
  data: unknown;
  odooWriteDate: Date | null;
  syncedAt: Date;
}

export { odooDatetime };

/** Resultado de um ciclo incremental: contagem + watermark a persistir. */
export interface IncrementalResult {
  count: number;
  /**
   * Marca d'água a gravar como `lastIncrementalAt`. É capturada ANTES do
   * fetch — qualquer registro modificado no Odoo durante o pull multi-página
   * será reprocessado no próximo ciclo, sem perda silenciosa (CR-01).
   */
  watermark: Date;
}

export async function syncIncremental(
  client: OdooClient,
  raw: RawDelegate,
  odooModel: string,
  since: Date | null,
): Promise<IncrementalResult> {
  // Capturada ANTES do search_read: o próximo ciclo filtra por write_date >
  // cycleStart, então registros escritos durante o pull entram no próximo ciclo.
  const cycleStart = new Date();
  const domain = since ? [["write_date", ">", odooDatetime(since)]] : [];
  const fields = await getModelFields(client, odooModel);
  const records = (await client.searchReadPaged(odooModel, domain, { fields })) as Record<string, unknown>[];
  const now = new Date();
  for (const rec of records) {
    const odooId = Number(rec.id);
    const odooWriteDate = parseWriteDate(rec.write_date);
    await raw.upsert({
      where: { odooId },
      create: { odooId, data: rec, odooWriteDate, syncedAt: now },
      update: { data: rec, odooWriteDate, syncedAt: now },
    });
  }
  return { count: records.length, watermark: cycleStart };
}
