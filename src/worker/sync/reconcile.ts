// src/worker/sync/reconcile.ts
import type { OdooClient } from "../odoo/client";
import { corteDomain } from "./corte";

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
  // Limpa 2026+ (T2c): o conjunto "vivo" usa o MESMO corte do cache , sem
  // isso, IDs pre-2026 vivos no Odoo nunca poderiam ser comparados de forma
  // coerente com um cache que so guarda 2026+.
  const vivos = new Set(await client.searchIds(odooModel, corteDomain(odooModel)));
  const noCache = await raw.findMany({ select: { odooId: true } });
  const sumidos = noCache.map((r) => r.odooId).filter((id) => !vivos.has(id));
  if (!sumidos.length) return 0;
  const res = await raw.updateMany({
    where: { odooId: { in: sumidos } },
    data: { rawDeleted: true },
  });
  return res.count;
}
