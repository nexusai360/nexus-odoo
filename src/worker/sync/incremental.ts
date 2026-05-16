// src/worker/sync/incremental.ts
import type { OdooClient } from "../odoo/client";

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

/** Formata uma Date para o formato de datetime do Odoo: "YYYY-MM-DD HH:MM:SS" (UTC). */
export function odooDatetime(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function parseWriteDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function syncIncremental(
  client: OdooClient,
  raw: RawDelegate,
  odooModel: string,
  since: Date | null,
): Promise<number> {
  const domain = since ? [["write_date", ">", odooDatetime(since)]] : [];
  const records = (await client.searchReadPaged(odooModel, domain)) as Record<string, unknown>[];
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
  return records.length;
}
