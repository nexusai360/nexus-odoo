// B3 (cobrança bancária): builder da remessa bancária (cabeçalho enviado ao banco).
// Fonte: raw_finan_remessa (modelo finan.remessa).
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";
import { str, numStr, bool, dt } from "./_coerce";

export interface FatoRemessaBancariaRow {
  odooId: number;
  tipo: string | null;
  bancoId: number | null;
  bancoNome: string | null;
  cnpjCpfRaiz: string | null;
  carteiraId: number | null;
  numero: string | null;
  data: Date | null;
  dataPagamento: Date | null;
  confirmada: boolean;
  dataConfirmacao: Date | null;
}

export function mapRemessaBancariaRow(raw: Record<string, unknown>): FatoRemessaBancariaRow {
  return {
    odooId: Number(raw.id),
    tipo: str(raw.tipo),
    bancoId: relId(raw.banco_id as OdooM2O),
    bancoNome: relNome(raw.banco_id as OdooM2O),
    cnpjCpfRaiz: str(raw.cnpj_cpf_raiz),
    carteiraId: relId(raw.carteira_id as OdooM2O),
    numero: numStr(raw.numero), // integer no Odoo
    data: dt(raw.data),
    dataPagamento: dt(raw.data_pagamento),
    confirmada: bool(raw.confirmada),
    dataConfirmacao: dt(raw.data_confirmacao),
  };
}

export async function rebuildFatoRemessaBancaria(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawFinanRemessa.findMany({ where: { rawDeleted: false } });
  const mapped = rawRows.map((r) => mapRemessaBancariaRow(r.data as Record<string, unknown>));
  await prisma.$transaction(
    async (tx) => {
      await tx.fatoRemessaBancaria.deleteMany({});
      if (mapped.length) await tx.fatoRemessaBancaria.createMany({ data: mapped });
      await markFatoBuilt(tx, "fato_remessa_bancaria");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );
  return mapped.length;
}
