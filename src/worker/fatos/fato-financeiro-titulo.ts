// src/worker/fatos/fato-financeiro-titulo.ts
// CRITERIO_NAO_PAGO: dataPagamento == null (Task 4a.2 Step 4 — usado nas tools 4d.5/4d.6/4d.7)
// tipo derivado de sinal: sinal < 0 → "a_pagar"; sinal >= 0 → "a_receber"
// diasAtraso NÃO é coluna — calculado em runtime nas tools de vencidos
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";

export interface FatoFinanceiroTituloRow {
  odooId: number;
  tipo: string;
  participanteId: number | null;
  participanteNome: string | null;
  contaId: number | null;
  contaNome: string | null;
  numeroDocumento: string | null;
  dataDocumento: Date | null;
  dataVencimento: Date | null;
  dataPagamento: Date | null;
  situacao: string | null;
  situacaoSimples: string | null;
  vrDocumento: number;
  vrSaldo: number;
  vrTotal: number;
  vrJuros: number;
  vrMulta: number;
  vrDesconto: number;
  // NÃO inclui atualizadoEm — campo tem @default(now()) no schema (decisão N5)
  // NÃO inclui diasAtraso — não é coluna do schema
}

function derivaTipo(raw: Record<string, unknown>): string {
  const sinal = Number(raw.sinal ?? 0);
  return sinal < 0 ? "a_pagar" : "a_receber";
}

export function mapTituloRow(raw: Record<string, unknown>): FatoFinanceiroTituloRow {
  return {
    odooId: Number(raw.id),
    tipo: derivaTipo(raw),
    participanteId: relId(raw.participante_id as OdooM2O),
    participanteNome: relNome(raw.participante_id as OdooM2O),
    contaId: relId(raw.conta_id as OdooM2O),
    contaNome: relNome(raw.conta_id as OdooM2O),
    numeroDocumento: typeof raw.numero_documento === "string" ? raw.numero_documento : null,
    dataDocumento: raw.data_documento ? new Date(raw.data_documento as string) : null,
    dataVencimento: raw.data_vencimento ? new Date(raw.data_vencimento as string) : null,
    dataPagamento: raw.data_pagamento ? new Date(raw.data_pagamento as string) : null,
    situacao: typeof raw.situacao === "string" ? raw.situacao : null,
    situacaoSimples: typeof raw.situacao_divida_simples === "string" ? raw.situacao_divida_simples : null,
    vrDocumento: Number(raw.vr_documento ?? 0),
    vrSaldo: Number(raw.vr_saldo ?? 0),
    vrTotal: Number(raw.vr_total ?? 0),
    vrJuros: Number(raw.vr_juros ?? 0),
    vrMulta: Number(raw.vr_multa ?? 0),
    vrDesconto: Number(raw.vr_desconto ?? 0),
  };
}

/** Reconstrói fato_financeiro_titulo a partir de raw_finan_pagamento_divida. */
export async function rebuildFatoFinanceiroTitulo(
  prisma: PrismaClient,
): Promise<number> {
  const rawRows = await prisma.rawFinanPagamentoDivida.findMany({
    where: { rawDeleted: false },
  });
  const mapped = rawRows.map((r) =>
    mapTituloRow(r.data as Record<string, unknown>),
  );
  await prisma.$transaction(async (tx) => {
    await tx.fatoFinanceiroTitulo.deleteMany({});
    if (mapped.length) {
      // data: mapped — sem injetar atualizadoEm (divergência N5 vs fato-estoque-saldo)
      await tx.fatoFinanceiroTitulo.createMany({ data: mapped });
    }
    await markFatoBuilt(tx, "fato_financeiro_titulo");
  });
  return mapped.length;
}
