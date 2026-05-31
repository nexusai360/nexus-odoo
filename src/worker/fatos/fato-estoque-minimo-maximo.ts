// B6 (estoque avançado): builder de parâmetros mín/máx. Estrutural (0 reg hoje).
// Fonte: raw_estoque_minimo_maximo (modelo estoque.minimo.maximo).
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";
import { num } from "./_coerce";

export interface FatoEstoqueMinMaxRow {
  odooId: number;
  produtoId: number | null;
  produtoNome: string | null;
  localId: number | null;
  localNome: string | null;
  unidadeNome: string | null;
  quantidadeMinima: number;
  quantidadeMaxima: number;
}

export function mapEstoqueMinMaxRow(raw: Record<string, unknown>): FatoEstoqueMinMaxRow {
  return {
    odooId: Number(raw.id),
    produtoId: relId(raw.produto_id as OdooM2O),
    produtoNome: relNome(raw.produto_id as OdooM2O),
    localId: relId(raw.local_id as OdooM2O),
    localNome: relNome(raw.local_id as OdooM2O),
    unidadeNome: relNome(raw.unidade_id as OdooM2O),
    quantidadeMinima: num(raw.quantidade_minima),
    quantidadeMaxima: num(raw.quantidade_maxima),
  };
}

export async function rebuildFatoEstoqueMinMax(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawEstoqueMinimoMaximo.findMany({ where: { rawDeleted: false } });
  const mapped = rawRows.map((r) => mapEstoqueMinMaxRow(r.data as Record<string, unknown>));
  await prisma.$transaction(
    async (tx) => {
      await tx.fatoEstoqueMinMax.deleteMany({});
      if (mapped.length) await tx.fatoEstoqueMinMax.createMany({ data: mapped });
      await markFatoBuilt(tx, "fato_estoque_min_max");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );
  return mapped.length;
}
