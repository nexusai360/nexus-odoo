// src/worker/fatos/fato-estoque-saldo.ts
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";

export interface ProdutoClass {
  familiaId: number | null;
  familiaNome: string | null;
  marcaId: number | null;
  marcaNome: string | null;
}

/** Monta o mapa produtoId -> classificação a partir de raw_sped_produto. */
export function buildProdutoClassMap(
  rawRows: { data: unknown }[],
): Map<number, ProdutoClass> {
  const map = new Map<number, ProdutoClass>();
  for (const row of rawRows) {
    const data = row.data as Record<string, unknown>;
    const id = Number(data.id);
    if (!Number.isFinite(id)) continue;
    map.set(id, {
      familiaId: relId(data.familia_id as OdooM2O),
      familiaNome: relNome(data.familia_id as OdooM2O),
      marcaId: relId(data.marca_id as OdooM2O),
      marcaNome: relNome(data.marca_id as OdooM2O),
    });
  }
  return map;
}

/** Lê raw_sped_produto e devolve o mapa de classificação. */
export async function loadProdutoClassMap(
  prisma: PrismaClient,
): Promise<Map<number, ProdutoClass>> {
  const rows = await prisma.rawSpedProduto.findMany({
    where: { rawDeleted: false },
    select: { data: true },
  });
  return buildProdutoClassMap(rows);
}

export interface FatoSaldoRow {
  odooSaldoId: number;
  produtoId: number | null;
  produtoNome: string | null;
  localId: number | null;
  localNome: string | null;
  quantidade: number;
  unidade: string | null;
  vrSaldo: number;
  familiaId: number | null;
  familiaNome: string | null;
  marcaId: number | null;
  marcaNome: string | null;
}

export function mapSaldoRow(
  raw: Record<string, unknown>,
  classMap: Map<number, ProdutoClass>,
): FatoSaldoRow {
  const produtoId = relId(raw.produto_id as OdooM2O);
  const cls = produtoId != null ? classMap.get(produtoId) : undefined;
  return {
    odooSaldoId: Number(raw.id),
    produtoId,
    produtoNome: relNome(raw.produto_id as OdooM2O),
    localId: relId(raw.local_id as OdooM2O),
    localNome: relNome(raw.local_id as OdooM2O),
    quantidade: Number(raw.saldo ?? 0),
    unidade: relNome(raw.unidade_id as OdooM2O),
    vrSaldo: Number(raw.vr_saldo ?? 0),
    familiaId: cls?.familiaId ?? null,
    familiaNome: cls?.familiaNome ?? null,
    marcaId: cls?.marcaId ?? null,
    marcaNome: cls?.marcaNome ?? null,
  };
}

/** Reconstrói fato_estoque_saldo a partir de raw_estoque_saldo_hoje. */
export async function rebuildFatoEstoqueSaldo(
  prisma: PrismaClient,
): Promise<number> {
  const classMap = await loadProdutoClassMap(prisma);
  const rawRows = await prisma.rawEstoqueSaldoHoje.findMany({
    where: { rawDeleted: false },
  });
  const mapped = rawRows.map((r) =>
    mapSaldoRow(r.data as Record<string, unknown>, classMap),
  );
  await prisma.$transaction(async (tx) => {
    await tx.fatoEstoqueSaldo.deleteMany({});
    if (mapped.length) {
      await tx.fatoEstoqueSaldo.createMany({
        data: mapped.map((m) => ({ ...m, atualizadoEm: new Date() })),
      });
    }
  });
  await markFatoBuilt(prisma, "fato_estoque_saldo");
  return mapped.length;
}
