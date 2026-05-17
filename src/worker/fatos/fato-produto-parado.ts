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

export interface FatoProdutoParadoRow {
  saldoHojeId: number;
  produtoId: number | null;
  produtoNome: string | null;
  localId: number | null;
  localNome: string | null;
  saldo: number;
  dias: number;
  vrSaldo: number;
  unidade: string | null;
}

/** Deriva uma linha de fato_produto_parado; null se o join não casar. */
export function mapProdutoParadoRow(
  raw: { data: unknown },
  saldoMap: Map<number, SaldoHojeInfo>,
): FatoProdutoParadoRow | null {
  const data = raw.data as Record<string, unknown>;
  const saldoHojeId = relId(data.saldo_hoje_id as OdooM2O);
  if (saldoHojeId == null) return null;
  const info = saldoMap.get(saldoHojeId);
  if (!info) return null;
  return {
    saldoHojeId,
    produtoId: info.produtoId,
    produtoNome: info.produtoNome,
    localId: info.localId,
    localNome: info.localNome,
    saldo: info.saldo,
    dias: Number(data.dias ?? 0),
    vrSaldo: info.vrSaldo,
    unidade: info.unidade,
  };
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
