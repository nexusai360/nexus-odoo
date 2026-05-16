// src/worker/sync/reconcile.ts
import type { OdooClient } from "../odoo/client";

export interface ReconcileDelegate {
  findMany(args: { select: { odooId: true } }): Promise<{ odooId: number }[]>;
  updateMany(args: {
    where: { odooId: { in: number[] } };
    data: { rawDeleted: true };
  }): Promise<{ count: number }>;
}

export async function reconcileModel(
  client: OdooClient,
  raw: ReconcileDelegate,
  odooModel: string,
): Promise<number> {
  const vivos = new Set(await client.searchIds(odooModel, []));
  const noCache = await raw.findMany({ select: { odooId: true } });
  const sumidos = noCache.map((r) => r.odooId).filter((id) => !vivos.has(id));
  if (!sumidos.length) return 0;
  const res = await raw.updateMany({
    where: { odooId: { in: sumidos } },
    data: { rawDeleted: true },
  });
  return res.count;
}
