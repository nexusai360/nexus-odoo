// src/worker/fatos/fato-pedido.ts
// Builder do fato_pedido , fonte: raw_pedido_documento (modelo pedido.documento).
//
// A flag de etapa final é CAMPO_ETAPA_FINAL = "finaliza_pedido_confirmando"
// (discovery O.1 , docs/superpowers/research/2026-05-18-f4-discovery-pre-schema.md).
// O campo selection de tipo é CAMPO_TIPO_PEDIDO = "tipo"
// (valores: "venda", "inventario", "transferencia_solicitacao").
//
// etapaFinaliza é carregada de raw_pedido_etapa ANTES da transação e passada
// via Map para o mapper , a transação envolve só deleteMany/createMany/markFatoBuilt.

import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";

// Constantes da discovery O.1
const CAMPO_ETAPA_FINAL = "finaliza_pedido_confirmando";
const CAMPO_TIPO_PEDIDO = "tipo";

export interface FatoPedidoRow {
  odooId: number;
  numero: string | null;
  tipo: string;
  etapaId: number | null;
  etapaNome: string | null;
  etapaFinaliza: boolean;
  operacaoId: number | null;
  operacaoNome: string | null;
  participanteId: number | null;
  participanteNome: string | null;
  vendedorId: number | null;
  vendedorNome: string | null;
  empresaId: number | null;
  empresaNome: string | null;
  dataOrcamento: Date | null;
  dataAprovacao: Date | null;
  dataValidade: Date | null;
  dataPrevista: Date | null;
  vrProdutos: number;
  vrNf: number;
  // NÃO inclui atualizadoEm , campo tem @default(now()) no schema (decisão N5)
}

export function mapPedidoRow(
  raw: Record<string, unknown>,
  etapaFinalizaMap: Map<number, boolean>,
): FatoPedidoRow {
  const etapaId = relId(raw.etapa_id as OdooM2O);
  return {
    odooId: Number(raw.id),
    numero: typeof raw.numero === "string" ? raw.numero : null,
    tipo: typeof raw[CAMPO_TIPO_PEDIDO] === "string" ? String(raw[CAMPO_TIPO_PEDIDO]) : "",
    etapaId,
    etapaNome: relNome(raw.etapa_id as OdooM2O),
    etapaFinaliza: etapaId !== null ? (etapaFinalizaMap.get(etapaId) ?? false) : false,
    operacaoId: relId(raw.operacao_id as OdooM2O),
    operacaoNome: relNome(raw.operacao_id as OdooM2O),
    participanteId: relId(raw.participante_id as OdooM2O),
    participanteNome: relNome(raw.participante_id as OdooM2O),
    vendedorId: relId(raw.vendedor_id as OdooM2O),
    vendedorNome: relNome(raw.vendedor_id as OdooM2O),
    empresaId: relId(raw.empresa_id as OdooM2O),
    empresaNome: relNome(raw.empresa_id as OdooM2O),
    dataOrcamento: typeof raw.data_orcamento === "string" ? new Date(`${raw.data_orcamento}T00:00:00`) : null,
    dataAprovacao: typeof raw.data_aprovacao === "string" ? new Date(`${raw.data_aprovacao}T00:00:00`) : null,
    dataValidade: typeof raw.data_validade === "string" ? new Date(`${raw.data_validade}T00:00:00`) : null,
    dataPrevista: typeof raw.data_prevista === "string" ? new Date(`${raw.data_prevista}T00:00:00`) : null,
    vrProdutos: Number(raw.vr_produtos ?? 0),
    vrNf: Number(raw.vr_nf ?? 0),
  };
}

/** Reconstrói fato_pedido a partir de raw_pedido_documento.
 * Lê raw_pedido_etapa ANTES da transação para montar o Map de etapa_finaliza. */
export async function rebuildFatoPedido(prisma: PrismaClient): Promise<number> {
  // Montar Map etapaId → flag CAMPO_ETAPA_FINAL antes da transação
  const rawEtapas = await prisma.rawPedidoEtapa.findMany({
    where: { rawDeleted: false },
  });
  const etapaFinalizaMap = new Map<number, boolean>();
  for (const e of rawEtapas) {
    const data = e.data as Record<string, unknown>;
    const id = Number(data.id);
    const finaliza = Boolean(data[CAMPO_ETAPA_FINAL]);
    etapaFinalizaMap.set(id, finaliza);
  }

  // Ler documentos
  const rawDocs = await prisma.rawPedidoDocumento.findMany({
    where: { rawDeleted: false },
  });
  const mapped = rawDocs.map((r) =>
    mapPedidoRow(r.data as Record<string, unknown>, etapaFinalizaMap),
  );

  await prisma.$transaction(async (tx) => {
    await tx.fatoPedido.deleteMany({});
    if (mapped.length) {
      await tx.fatoPedido.createMany({ data: mapped });
    }
    await markFatoBuilt(tx, "fato_pedido");
  });

  return mapped.length;
}
