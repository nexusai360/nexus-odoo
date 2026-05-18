// src/worker/fatos/fato-financeiro-saldo.ts
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";

export interface FatoFinanceiroSaldoRow {
  bancoId: number;
  bancoNome: string | null;
  tipo: string | null;
  dataReferencia: Date | null;
  saldoAnterior: number;
  entrada: number;
  saida: number;
  saldo: number;
  // NÃO inclui atualizadoEm — campo tem @default(now()) no schema (decisão N5)
}

export function mapSaldoFinanceiroRow(
  raw: Record<string, unknown>,
): FatoFinanceiroSaldoRow {
  const dataRef = raw.data_referencia;
  return {
    bancoId: Number(raw.id),
    bancoNome: relNome(raw.banco_id as OdooM2O),
    tipo: typeof raw.tipo === "string" ? raw.tipo : null,
    dataReferencia: dataRef ? new Date(dataRef as string) : null,
    saldoAnterior: Number(raw.saldo_anterior ?? 0),
    entrada: Number(raw.entrada ?? 0),
    saida: Number(raw.saida ?? 0),
    saldo: Number(raw.saldo ?? 0),
  };
}

/** Reconstrói fato_financeiro_saldo a partir de raw_finan_banco_saldo_hoje. */
export async function rebuildFatoFinanceiroSaldo(
  prisma: PrismaClient,
): Promise<number> {
  const rawRows = await prisma.rawFinanBancoSaldoHoje.findMany({
    where: { rawDeleted: false },
  });
  const mapped = rawRows.map((r) =>
    mapSaldoFinanceiroRow(r.data as Record<string, unknown>),
  );
  await prisma.$transaction(async (tx) => {
    await tx.fatoFinanceiroSaldo.deleteMany({});
    if (mapped.length) {
      // data: mapped — sem injetar atualizadoEm (divergência N5 vs fato-estoque-saldo)
      await tx.fatoFinanceiroSaldo.createMany({ data: mapped });
    }
    await markFatoBuilt(tx, "fato_financeiro_saldo");
  });
  return mapped.length;
}
