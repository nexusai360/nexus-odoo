// src/worker/fatos/fato-pedido-historico.ts
// Builder do fato_pedido_historico , fonte: raw_pedido_documento_historico
// (modelo pedido.documento.historico). 1 linha = 1 mudanca de etapa (etapa de
// destino). Permite "tempo em cada etapa" e "pedidos travados no fluxo".
//
// Decisoes aterradas no dado real (review O3 #2):
// - FK do pedido = pedido_id (nao documento_id).
// - tempo_etapa e INT em DIAS, ja calculado pelo Odoo; ~204 valores negativos
//   (data_proxima < data_ultima), saneados com GREATEST(_,0) aqui no builder.
// - etapaNome/usuario vem do label do m2o (etapa_id[1], create_uid[0]).

import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";

export interface FatoPedidoHistoricoRow {
  odooId: number;
  pedidoId: number | null;
  etapaId: number | null;
  etapaNome: string | null;
  etapaTipo: string | null;
  dataEntrada: Date | null;
  dataProxima: Date | null;
  tempoEtapaDias: number;
  usuarioId: number | null;
  criadoEm: Date | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const dt = (v: unknown): Date | null =>
  typeof v === "string" && v ? new Date(v.replace(" ", "T")) : null;

export function mapPedidoHistoricoRow(raw: Record<string, unknown>): FatoPedidoHistoricoRow {
  const tempo = Number(raw.tempo_etapa ?? 0);
  return {
    odooId: Number(raw.id),
    pedidoId: relId(raw.pedido_id as OdooM2O),
    etapaId: relId(raw.etapa_id as OdooM2O),
    etapaNome: relNome(raw.etapa_id as OdooM2O),
    etapaTipo: str(raw.etapa_tipo),
    dataEntrada: dt(raw.data_ultima_etapa),
    dataProxima: dt(raw.data_proxima_etapa),
    // GREATEST(tempo_etapa, 0): saneia os ~204 negativos do dado real.
    tempoEtapaDias: Number.isFinite(tempo) ? Math.max(0, Math.trunc(tempo)) : 0,
    usuarioId: relId(raw.create_uid as OdooM2O),
    criadoEm: dt(raw.create_date),
  };
}

export async function rebuildFatoPedidoHistorico(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawPedidoDocumentoHistorico.findMany({
    where: { rawDeleted: false },
  });
  const mapped = rawRows.map((r) => mapPedidoHistoricoRow(r.data as Record<string, unknown>));

  await prisma.$transaction(
    async (tx) => {
      await tx.fatoPedidoHistorico.deleteMany({});
      if (mapped.length) {
        await tx.fatoPedidoHistorico.createMany({ data: mapped });
      }
      await markFatoBuilt(tx, "fato_pedido_historico");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );

  return mapped.length;
}
