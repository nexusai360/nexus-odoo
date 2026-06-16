// src/worker/fatos/fato-pedido-parcela.ts
// Builder do fato_pedido_parcela , fonte: raw_pedido_parcela (modelo pedido.parcela).
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";

export interface FatoPedidoParcelaRow {
  odooId: number;
  pedidoId: number | null;
  numero: string | null;
  participanteId: number | null;
  participanteNome: string | null;
  dataVencimento: Date | null;
  valor: number;
  vrJuros: number;
  vrMulta: number;
  vrDesconto: number;
  vrDocumento: number;
  formaPagamentoNome: string | null;
  parcelaFaturada: boolean;
  finanLancamentoId: number | null;
  // NÃO inclui atualizadoEm , campo tem @default(now()) no schema (decisão N5)
}

export function mapPedidoParcelaRow(raw: Record<string, unknown>): FatoPedidoParcelaRow {
  return {
    odooId: Number(raw.id),
    pedidoId: relId(raw.pedido_id as OdooM2O),
    numero: typeof raw.numero === "string" ? raw.numero : null,
    participanteId: relId(raw.participante_id as OdooM2O),
    participanteNome: relNome(raw.participante_id as OdooM2O),
    dataVencimento:
      typeof raw.data_vencimento === "string"
        ? new Date(`${raw.data_vencimento}T00:00:00Z`)
        : null,
    valor: Number(raw.valor ?? raw.valor_readonly ?? 0),
    vrJuros: Number(raw.vr_juros ?? 0),
    vrMulta: Number(raw.vr_multa ?? 0),
    vrDesconto: Number(raw.vr_desconto ?? 0),
    vrDocumento: Number(raw.vr_documento ?? 0),
    formaPagamentoNome: relNome(raw.forma_pagamento_id as OdooM2O),
    parcelaFaturada: Boolean(raw.parcela_faturada),
    finanLancamentoId: relId(raw.finan_lancamento_id as OdooM2O),
  };
}

/** Reconstrói fato_pedido_parcela a partir de raw_pedido_parcela. */
export async function rebuildFatoPedidoParcela(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawPedidoParcela.findMany({
    where: { rawDeleted: false },
  });
  const mapped = rawRows.map((r) =>
    mapPedidoParcelaRow(r.data as Record<string, unknown>),
  );

  await prisma.$transaction(
    async (tx) => {
      await tx.fatoPedidoParcela.deleteMany({});
      if (mapped.length) {
        await tx.fatoPedidoParcela.createMany({ data: mapped });
      }
      await markFatoBuilt(tx, "fato_pedido_parcela");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );

  return mapped.length;
}
