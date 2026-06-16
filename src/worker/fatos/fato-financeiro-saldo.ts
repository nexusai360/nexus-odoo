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
  // NÃO inclui atualizadoEm , campo tem @default(now()) no schema (decisão N5)
}

export function mapSaldoFinanceiroRow(
  raw: Record<string, unknown>,
): FatoFinanceiroSaldoRow {
  // raw.data é date-only ("2026-05-14"). Sufixo T00:00:00 força parsing como hora
  // local, evitando desvio UTC→GMT-3 que deslocaria a data em 1 dia (I2).
  const dataRaw = typeof raw.data === "string" ? raw.data : null;
  return {
    // C1: PK lógica é banco_id (many2one), não raw.id (id da linha do snapshot).
    bancoId: relId(raw.banco_id as OdooM2O) ?? 0,
    bancoNome: relNome(raw.banco_id as OdooM2O),
    tipo: typeof raw.tipo === "string" ? raw.tipo : null,
    // C2: campo real é "data" (não "data_referencia") e "anterior" (não "saldo_anterior").
    dataReferencia: dataRaw ? new Date(`${dataRaw}T00:00:00Z`) : null,
    saldoAnterior: Number(raw.anterior ?? 0),
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
  await prisma.$transaction(
    async (tx) => {
      await tx.fatoFinanceiroSaldo.deleteMany({});
      if (mapped.length) {
        // data: mapped , sem injetar atualizadoEm (divergência N5 vs fato-estoque-saldo)
        await tx.fatoFinanceiroSaldo.createMany({ data: mapped });
      }
      await markFatoBuilt(tx, "fato_financeiro_saldo");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );
  return mapped.length;
}
