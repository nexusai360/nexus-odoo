// src/worker/sync/incremental.ts
import type { OdooClient } from "../odoo/client";
import { odooDatetime, parseWriteDate } from "../odoo/datetime";
import { getModelFields } from "../odoo/field-selection";

/** Tamanho padrão de cada página buscada do Odoo. */
const PAGE_SIZE = 500;

/** Tamanho do lote de createMany no backfill. */
const BATCH_SIZE = 1000;

/** Interface mínima de uma tabela raw Prisma (prisma.rawXxx). */
export interface RawDelegate {
  upsert(args: {
    where: { odooId: number };
    create: RawRow;
    update: Omit<RawRow, "odooId">;
  }): Promise<unknown>;
  createMany(args: { data: RawRow[]; skipDuplicates: boolean }): Promise<unknown>;
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

/**
 * Sincroniza um modelo Odoo página a página, limitando uso de memória a uma
 * página por vez e persistindo incrementalmente.
 *
 * Backfill (since === null): usa createMany em lotes — muito mais rápido que
 * upsert registro a registro (211k upserts → ~420 createMany em lotes de 500).
 * skipDuplicates: true evita colisão em execuções interrompidas/retomadas.
 *
 * Ciclo incremental (since !== null): usa upsert para atualizar registros
 * existentes sem risco de duplicata.
 */
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
  const isBackfill = since === null;

  let count = 0;
  let offset = 0;
  const now = new Date();

  for (;;) {
    const { records, hasMore } = await client.searchReadPage(odooModel, domain, {
      offset,
      pageSize: PAGE_SIZE,
      fields,
    });

    const typedRecords = records as Record<string, unknown>[];

    if (isBackfill) {
      // Backfill: insere em lotes via createMany para máxima eficiência.
      // skipDuplicates garante idempotência se uma execução anterior foi interrompida.
      for (let i = 0; i < typedRecords.length; i += BATCH_SIZE) {
        const batch = typedRecords.slice(i, i + BATCH_SIZE).map((rec) => ({
          odooId: Number(rec.id),
          data: rec,
          odooWriteDate: parseWriteDate(rec.write_date),
          syncedAt: now,
        }));
        await raw.createMany({ data: batch, skipDuplicates: true });
      }
    } else {
      // Ciclo incremental: upsert para atualizar registros existentes.
      for (const rec of typedRecords) {
        const odooId = Number(rec.id);
        const odooWriteDate = parseWriteDate(rec.write_date);
        await raw.upsert({
          where: { odooId },
          create: { odooId, data: rec, odooWriteDate, syncedAt: now },
          update: { data: rec, odooWriteDate, syncedAt: now },
        });
      }
    }

    count += typedRecords.length;
    if (!hasMore) break;
    offset += PAGE_SIZE;
  }

  return { count, watermark: cycleStart };
}
