// src/worker/fatos/fato-financeiro-titulo.ts
// CRITERIO_ABERTO: situacaoSimples == 'aberto' (corrigido 2026-05-18 — dataPagamento nunca é null
//   pois finan.pagamento.divida é registro de pagamento; campo situacao_divida_simples é o oráculo).
//   Distribuição real: aberto=21 (20 a_receber + 1 a_pagar), quitado=1120, baixado=1, provisorio=4.
//   Usado nas queries de contas_a_receber, contas_a_pagar e titulos_vencidos.
// tipo mapeado do campo selection real: "pagamento" → "a_pagar"; "recebimento" → "a_receber".
// Evidência empírica (2026-05-18): 412 pagamento/sinal=-1; 729 recebimento/sinal=1;
// 5 recebimento/sinal=0 — sinal=0 invalida a regra sinal>=0→a_receber; campo tipo é o oráculo.
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

/** I1: mapeia o campo selection real "tipo" da fonte.
 * "pagamento" → "a_pagar"; qualquer outro valor (incl. "recebimento") → "a_receber".
 * Fonte empírica: 412 "pagamento" (sinal=-1), 729 "recebimento" (sinal=1),
 * 5 "recebimento" (sinal=0) — sinal=0 invalida a derivação por sinal; usar tipo. */
function derivaTipo(raw: Record<string, unknown>): string {
  const tipo = typeof raw.tipo === "string" ? raw.tipo : "";
  return tipo === "pagamento" ? "a_pagar" : "a_receber";
}

export function mapTituloRow(raw: Record<string, unknown>): FatoFinanceiroTituloRow {
  return {
    odooId: Number(raw.id),
    tipo: derivaTipo(raw),
    participanteId: relId(raw.participante_id as OdooM2O),
    participanteNome: relNome(raw.participante_id as OdooM2O),
    contaId: relId(raw.conta_id as OdooM2O),
    contaNome: relNome(raw.conta_id as OdooM2O),
    // C3: campo real é "numero" (não "numero_documento" — sempre null na fonte).
    numeroDocumento: typeof raw.numero === "string" ? raw.numero : null,
    // I2: sufixo T00:00:00 força parsing como hora local, evitando desvio UTC→GMT-3.
    dataDocumento: typeof raw.data_documento === "string" ? new Date(`${raw.data_documento}T00:00:00`) : null,
    dataVencimento: typeof raw.data_vencimento === "string" ? new Date(`${raw.data_vencimento}T00:00:00`) : null,
    dataPagamento: typeof raw.data_pagamento === "string" ? new Date(`${raw.data_pagamento}T00:00:00`) : null,
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
