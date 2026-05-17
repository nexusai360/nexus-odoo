// src/worker/fatos/fato-estoque-movimento.ts
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";

export interface FatoMovimentoRow {
  odooId: number;
  produtoId: number | null;
  produtoNome: string | null;
  localId: number | null;
  localNome: string | null;
  data: Date;
  mes: string;
  quantidade: number;
  sentido: string;
  localInversoId: number | null;
  origem: string | null;
}

/** Movimento de quantidade 0 é ajuste sem efeito físico — descartado do fato. */
export function temEfeito(row: FatoMovimentoRow): boolean {
  return row.quantidade !== 0;
}

/** Deriva uma linha de fato_estoque_movimento de um registro raw. */
export function mapMovimentoRow(
  raw: Record<string, unknown>,
): FatoMovimentoRow {
  const quantidade = Number(raw.quantidade ?? 0);
  const data = new Date(String(raw.data));
  const mes = `${data.getUTCFullYear()}-${String(
    data.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
  return {
    odooId: Number(raw.id),
    produtoId: relId(raw.produto_id as OdooM2O),
    produtoNome: relNome(raw.produto_id as OdooM2O),
    localId: relId(raw.local_id as OdooM2O),
    localNome: relNome(raw.local_id as OdooM2O),
    data,
    mes,
    quantidade,
    sentido: quantidade > 0 ? "entrada" : "saida",
    localInversoId: relId(raw.local_inverso_id as OdooM2O),
    origem: typeof raw.origem === "string" ? raw.origem : null,
  };
}

const BATCH = 1000;

/** Reconstrói fato_estoque_movimento a partir de raw_estoque_extrato. */
export async function rebuildFatoEstoqueMovimento(
  prisma: PrismaClient,
): Promise<number> {
  const rawRows = await prisma.rawEstoqueExtrato.findMany({
    where: { rawDeleted: false },
  });
  const mapped = rawRows
    .map((r) => mapMovimentoRow(r.data as Record<string, unknown>))
    .filter(temEfeito);
  await prisma.$transaction(async (tx) => {
    await tx.fatoEstoqueMovimento.deleteMany({});
    for (let i = 0; i < mapped.length; i += BATCH) {
      await tx.fatoEstoqueMovimento.createMany({
        data: mapped.slice(i, i + BATCH),
      });
    }
  });
  await markFatoBuilt(prisma, "fato_estoque_movimento");
  return mapped.length;
}
