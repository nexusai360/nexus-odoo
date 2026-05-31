// B3 (cobrança bancária): builder do item de retorno (grão de baixas/pagamentos).
// Fonte: raw_finan_retorno_item (modelo finan.retorno.item).
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";
import { str, num, dt } from "./_coerce";

export interface FatoRetornoItemRow {
  odooId: number;
  retornoId: number | null;
  situacao: string | null;
  nossoNumero: string | null;
  numero: string | null;
  tipo: string | null;
  dataRegistro: Date | null;
  dataPagamento: Date | null;
  dataCreditoDebito: Date | null;
  dataBaixa: Date | null;
  vrDocumento: number;
  vrJuros: number;
  vrMulta: number;
  vrDesconto: number;
  vrTarifas: number;
  vrBaixado: number;
  vrTotal: number;
  dividaNumero: string | null;
  dividaParticipanteId: number | null;
  dividaParticipanteNome: string | null;
  dividaDataVencimento: Date | null;
  dividaSituacao: string | null;
  motivoRejeicao: string | null;
  bancoId: number | null;
  bancoNome: string | null;
}

export function mapRetornoItemRow(raw: Record<string, unknown>): FatoRetornoItemRow {
  return {
    odooId: Number(raw.id),
    retornoId: relId(raw.retorno_id as OdooM2O),
    situacao: str(raw.situacao),
    nossoNumero: str(raw.nosso_numero),
    numero: str(raw.numero),
    tipo: str(raw.tipo),
    dataRegistro: dt(raw.data_registro),
    dataPagamento: dt(raw.data_pagamento),
    dataCreditoDebito: dt(raw.data_credito_debito),
    dataBaixa: dt(raw.data_baixa),
    vrDocumento: num(raw.vr_documento),
    vrJuros: num(raw.vr_juros),
    vrMulta: num(raw.vr_multa),
    vrDesconto: num(raw.vr_desconto),
    vrTarifas: num(raw.vr_tarifas),
    vrBaixado: num(raw.vr_baixado),
    vrTotal: num(raw.vr_total),
    dividaNumero: str(raw.divida_numero),
    dividaParticipanteId: relId(raw.divida_participante_id as OdooM2O),
    dividaParticipanteNome: relNome(raw.divida_participante_id as OdooM2O),
    dividaDataVencimento: dt(raw.divida_data_vencimento),
    dividaSituacao: str(raw.divida_situacao),
    motivoRejeicao: str(raw.motivo_rejeicao),
    bancoId: relId(raw.banco_id as OdooM2O),
    bancoNome: relNome(raw.banco_id as OdooM2O),
  };
}

export async function rebuildFatoRetornoItem(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawFinanRetornoItem.findMany({ where: { rawDeleted: false } });
  const mapped = rawRows.map((r) => mapRetornoItemRow(r.data as Record<string, unknown>));
  await prisma.$transaction(
    async (tx) => {
      await tx.fatoRetornoItem.deleteMany({});
      if (mapped.length) await tx.fatoRetornoItem.createMany({ data: mapped });
      await markFatoBuilt(tx, "fato_retorno_item");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );
  return mapped.length;
}
