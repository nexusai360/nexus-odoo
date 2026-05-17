// src/worker/fatos/fato-produto-parado.ts
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";

export interface SaldoHojeInfo {
  produtoId: number | null;
  produtoNome: string | null;
  localId: number | null;
  localNome: string | null;
  saldo: number;
  vrSaldo: number;
  unidade: string | null;
}

/** Monta o mapa id-da-linha-de-saldo -> info, a partir de raw_estoque_saldo_hoje. */
export function buildSaldoHojeMap(
  rawRows: { data: unknown }[],
): Map<number, SaldoHojeInfo> {
  const map = new Map<number, SaldoHojeInfo>();
  for (const row of rawRows) {
    const data = row.data as Record<string, unknown>;
    const id = Number(data.id);
    if (!Number.isFinite(id)) continue;
    map.set(id, {
      produtoId: relId(data.produto_id as OdooM2O),
      produtoNome: relNome(data.produto_id as OdooM2O),
      localId: relId(data.local_id as OdooM2O),
      localNome: relNome(data.local_id as OdooM2O),
      saldo: Number(data.saldo ?? 0),
      vrSaldo: Number(data.vr_saldo ?? 0),
      unidade: relNome(data.unidade_id as OdooM2O),
    });
  }
  return map;
}

/** Lê raw_estoque_saldo_hoje e devolve o mapa. */
export async function loadSaldoHojeMap(
  prisma: PrismaClient,
): Promise<Map<number, SaldoHojeInfo>> {
  const rows = await prisma.rawEstoqueSaldoHoje.findMany({
    where: { rawDeleted: false },
    select: { data: true },
  });
  return buildSaldoHojeMap(rows);
}
