// src/worker/fatos/fato-nota-fiscal.ts
// Builder do fato_nota_fiscal — fonte: raw_sped_documento (modelo sped.documento).
//
// tipoMovimento é derivado de entrada_saida: "1"→"saida", "0"→"entrada", else→"outro".
// Nunca é null — alinhado com @default("outro") no schema (achado P-I6).
// dataEmissao/dataEntradaSaida/dataAutorizacao usam sufixo T00:00:00 (parsing como hora local).
// Valores monetários via Number(... ?? 0). mapper não produz atualizadoEm (@default(now())).

import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";

export interface FatoNotaFiscalRow {
  odooId: number;
  numero: string | null;
  serie: string | null;
  modelo: string | null;
  entradaSaida: string | null;
  tipoMovimento: string;
  situacaoNfe: string | null;
  finalidadeNfe: string | null;
  chave: string | null;
  participanteId: number | null;
  participanteNome: string | null;
  naturezaOperacaoId: number | null;
  naturezaOperacaoNome: string | null;
  empresaId: number | null;
  empresaNome: string | null;
  dataEmissao: Date | null;
  dataEntradaSaida: Date | null;
  dataAutorizacao: Date | null;
  vrNf: number;
  vrProdutos: number;
  vrFatura: number;
  vrIbpt: number;
  vrIcmsProprio: number;
  vrDesconto: number;
  // NÃO inclui atualizadoEm — @default(now()) no schema (decisão N5)
}

/**
 * Deriva tipoMovimento a partir do campo entrada_saida.
 * "1" → "saida", "0" → "entrada", qualquer outro (incluindo null/undefined) → "outro".
 */
export function derivarTipoMovimento(entradaSaida: string): string {
  if (entradaSaida === "1") return "saida";
  if (entradaSaida === "0") return "entrada";
  // Ramo "outro" — inclui null, undefined, string desconhecida
  if (entradaSaida !== "1" && entradaSaida !== "0") {
    console.warn(`[fato-nota-fiscal] entradaSaida desconhecida: ${JSON.stringify(entradaSaida)} → tipoMovimento="outro"`);
  }
  return "outro";
}

export function mapNotaFiscalRow(raw: Record<string, unknown>): FatoNotaFiscalRow {
  const entradaSaida = typeof raw.entrada_saida === "string" ? raw.entrada_saida : null;
  return {
    odooId: Number(raw.id),
    numero: typeof raw.numero === "string" ? raw.numero : null,
    serie: typeof raw.serie === "string" ? raw.serie : null,
    modelo: typeof raw.modelo === "string" ? raw.modelo : null,
    entradaSaida,
    tipoMovimento: derivarTipoMovimento(entradaSaida as string),
    situacaoNfe: typeof raw.situacao_nfe === "string" ? raw.situacao_nfe : null,
    finalidadeNfe: typeof raw.finalidade_nfe === "string" ? raw.finalidade_nfe : null,
    chave: typeof raw.chave === "string" ? raw.chave : null,
    participanteId: relId(raw.participante_id as OdooM2O),
    participanteNome: relNome(raw.participante_id as OdooM2O),
    naturezaOperacaoId: relId(raw.natureza_operacao_id as OdooM2O),
    naturezaOperacaoNome: relNome(raw.natureza_operacao_id as OdooM2O),
    empresaId: relId(raw.empresa_id as OdooM2O),
    empresaNome: relNome(raw.empresa_id as OdooM2O),
    dataEmissao: typeof raw.data_emissao === "string" ? new Date(`${raw.data_emissao}T00:00:00`) : null,
    dataEntradaSaida: typeof raw.data_entrada_saida === "string" ? new Date(`${raw.data_entrada_saida}T00:00:00`) : null,
    dataAutorizacao: typeof raw.data_autorizacao === "string" ? new Date(`${raw.data_autorizacao}T00:00:00`) : null,
    vrNf: Number(raw.vr_nf ?? 0),
    vrProdutos: Number(raw.vr_produtos ?? 0),
    vrFatura: Number(raw.vr_fatura ?? 0),
    vrIbpt: Number(raw.vr_ibpt ?? 0),
    vrIcmsProprio: Number(raw.vr_icms_proprio ?? 0),
    vrDesconto: Number(raw.vr_desconto ?? 0),
  };
}

/** Reconstrói fato_nota_fiscal a partir de raw_sped_documento.
 * Filtra rawDeleted=false. Transação: deleteMany + createMany + markFatoBuilt. */
export async function rebuildFatoNotaFiscal(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawSpedDocumento.findMany({
    where: { rawDeleted: false },
  });
  const mapped = rawRows.map((r) => mapNotaFiscalRow(r.data as Record<string, unknown>));

  await prisma.$transaction(async (tx) => {
    await tx.fatoNotaFiscal.deleteMany({});
    if (mapped.length) {
      await tx.fatoNotaFiscal.createMany({ data: mapped });
    }
    await markFatoBuilt(tx, "fato_nota_fiscal");
  });

  return mapped.length;
}
