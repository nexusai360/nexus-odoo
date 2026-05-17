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
