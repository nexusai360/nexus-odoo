// src/worker/fatos/fato-financeiro-lancamento-item.ts
// Builder do fato_financeiro_lancamento_item , fonte: raw_finan_lancamento_item
// (finan.lancamento.item). Rateio por conta gerencial / centro de resultado.
// `tipo` e `dataDocumento` sao HERDADOS do lancamento pai (finan.lancamento), pois
// o item nao tem tipo proprio. Permite a DRE gerencial ("quanto por conta").
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";

export interface FatoFinanceiroLancamentoItemRow {
  odooId: number;
  lancamentoId: number | null;
  tipo: string;
  contaId: number | null;
  contaNome: string | null;
  centroResultadoId: number | null;
  centroResultadoNome: string | null;
  descricao: string | null;
  pedidoId: number | null;
  vrDocumento: number;
  vrTotal: number;
  vrSaldo: number;
  vrPagoTotal: number;
  dataDocumento: Date | null;
}

interface ParentInfo {
  tipo: string;
  dataDocumento: Date | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export function mapLancamentoItemRow(
  raw: Record<string, unknown>,
  parent: ParentInfo | undefined,
): FatoFinanceiroLancamentoItemRow {
  return {
    odooId: Number(raw.id),
    lancamentoId: relId(raw.lancamento_id as OdooM2O),
    tipo: parent?.tipo ?? "",
    contaId: relId(raw.conta_id as OdooM2O),
    contaNome: relNome(raw.conta_id as OdooM2O),
    centroResultadoId: relId(raw.centro_resultado_id as OdooM2O),
    centroResultadoNome: relNome(raw.centro_resultado_id as OdooM2O),
    descricao: str(raw.descricao),
    pedidoId: relId(raw.pedido_id as OdooM2O),
    vrDocumento: Number(raw.vr_documento ?? 0),
    vrTotal: Number(raw.vr_total ?? 0),
    vrSaldo: Number(raw.vr_saldo ?? 0),
    vrPagoTotal: Number(raw.vr_pago_total ?? 0),
    dataDocumento: parent?.dataDocumento ?? null,
  };
}

export async function rebuildFatoFinanceiroLancamentoItem(prisma: PrismaClient): Promise<number> {
  // Mapa do lancamento pai: id -> { tipo, dataDocumento }.
  const pais = await prisma.rawFinanLancamento.findMany({ where: { rawDeleted: false } });
  const parentMap = new Map<number, ParentInfo>();
  for (const p of pais) {
    const d = p.data as Record<string, unknown>;
    const id = Number(d.id);
    parentMap.set(id, {
      tipo: typeof d.tipo === "string" ? d.tipo : "",
      dataDocumento: typeof d.data_documento === "string" ? new Date(`${d.data_documento}T00:00:00`) : null,
    });
  }

  const itens = await prisma.rawFinanLancamentoItem.findMany({ where: { rawDeleted: false } });
  const mapped = itens.map((it) => {
    const raw = it.data as Record<string, unknown>;
    const lancId = relId(raw.lancamento_id as OdooM2O);
    return mapLancamentoItemRow(raw, lancId != null ? parentMap.get(lancId) : undefined);
  });

  await prisma.$transaction(
    async (tx) => {
      await tx.fatoFinanceiroLancamentoItem.deleteMany({});
      if (mapped.length) await tx.fatoFinanceiroLancamentoItem.createMany({ data: mapped });
      await markFatoBuilt(tx, "fato_financeiro_lancamento_item");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );

  return mapped.length;
}
