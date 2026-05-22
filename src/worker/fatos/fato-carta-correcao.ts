// src/worker/fatos/fato-carta-correcao.ts
// FONTE: raw_sped_carta_correcao (modelo sped.carta.correcao).
// ESCOPO: cartas de correção (CC-e) de documentos fiscais.
// CYCLE: incremental — volume baixo (~12 cartas).
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";

export interface FatoCartaCorrecaoRow {
  odooId: number;
  descricao: string | null;
  correcao: string | null;
  documentoId: number | null;
  dataAutorizacao: Date | null;
  protocoloAutorizacao: string | null;
  sequencia: number | null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function dateOrNull(v: unknown): Date | null {
  if (typeof v !== "string" || v.length < 8) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function mapCartaCorrecaoRow(raw: Record<string, unknown>): FatoCartaCorrecaoRow {
  return {
    odooId: Number(raw.id),
    descricao: str(raw.descricao),
    correcao: str(raw.correcao),
    documentoId: relId(raw.documento_id as OdooM2O),
    dataAutorizacao: dateOrNull(raw.data_autorizacao),
    protocoloAutorizacao: str(raw.protocolo_autorizacao),
    sequencia: typeof raw.sequencia === "number" ? raw.sequencia : null,
  };
}

/** Reconstrói fato_carta_correcao a partir de raw_sped_carta_correcao. */
export async function rebuildFatoCartaCorrecao(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawSpedCartaCorrecao.findMany({
    where: { rawDeleted: false },
  });
  const mapped = rawRows.map((r) =>
    mapCartaCorrecaoRow(r.data as Record<string, unknown>),
  );
  await prisma.$transaction(async (tx) => {
    await tx.fatoCartaCorrecao.deleteMany({});
    if (mapped.length) {
      await tx.fatoCartaCorrecao.createMany({ data: mapped });
    }
    await markFatoBuilt(tx, "fato_carta_correcao");
  });
  return mapped.length;
}
