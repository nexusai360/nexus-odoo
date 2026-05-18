// src/worker/fatos/fato-financeiro-movimento.ts
// Realizado e previsto coexistem na mesma linha (decisão #IM-2) — sem campo natureza.
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";

export interface FatoFinanceiroMovimentoRow {
  odooId: number;
  data: Date | null;
  contaId: number | null;
  contaNome: string | null;
  centroResultadoId: number | null;
  centroResultadoNome: string | null;
  entrada: number;
  saida: number;
  valor: number;
  entradaPrevista: number;
  saidaPrevista: number;
  valorPrevisto: number;
  // NÃO inclui atualizadoEm — campo tem @default(now()) no schema (decisão N5)
}

export function mapMovimentoRow(
  raw: Record<string, unknown>,
): FatoFinanceiroMovimentoRow {
  // I2: raw.data é date-only ("2026-05-14"). T00:00:00 força parsing como hora local.
  const dataRaw = typeof raw.data === "string" ? raw.data : null;
  return {
    odooId: Number(raw.id),
    data: dataRaw ? new Date(`${dataRaw}T00:00:00`) : null,
    contaId: relId(raw.conta_id as OdooM2O),
    contaNome: relNome(raw.conta_id as OdooM2O),
    centroResultadoId: relId(raw.centro_resultado_id as OdooM2O),
    centroResultadoNome: relNome(raw.centro_resultado_id as OdooM2O),
    entrada: Number(raw.entrada ?? 0),
    saida: Number(raw.saida ?? 0),
    valor: Number(raw.valor ?? 0),
    entradaPrevista: Number(raw.entrada_prevista ?? 0),
    saidaPrevista: Number(raw.saida_prevista ?? 0),
    valorPrevisto: Number(raw.valor_previsto ?? 0),
  };
}

/** Reconstrói fato_financeiro_movimento a partir de raw_finan_fluxo_caixa. */
export async function rebuildFatoFinanceiroMovimento(
  prisma: PrismaClient,
): Promise<number> {
  const rawRows = await prisma.rawFinanFluxoCaixa.findMany({
    where: { rawDeleted: false },
  });
  const mapped = rawRows.map((r) =>
    mapMovimentoRow(r.data as Record<string, unknown>),
  );
  await prisma.$transaction(async (tx) => {
    await tx.fatoFinanceiroMovimento.deleteMany({});
    if (mapped.length) {
      // data: mapped — sem injetar atualizadoEm (divergência N5 vs fato-estoque-saldo)
      await tx.fatoFinanceiroMovimento.createMany({ data: mapped });
    }
    await markFatoBuilt(tx, "fato_financeiro_movimento");
  });
  return mapped.length;
}
