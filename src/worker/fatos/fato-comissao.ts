// B4 (comercial): builder de comissão por pedido/vendedor. Estrutural (0 reg).
// Fonte: raw_pedido_comissao (modelo pedido.comissao).
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";
import { num } from "./_coerce";

export interface FatoComissaoRow {
  odooId: number;
  pedidoId: number | null;
  participanteId: number | null;
  participanteNome: string | null;
  bcComissao: number;
  alComissao: number;
  vrComissao: number;
}

export function mapComissaoRow(raw: Record<string, unknown>): FatoComissaoRow {
  return {
    odooId: Number(raw.id),
    pedidoId: relId(raw.pedido_id as OdooM2O),
    participanteId: relId(raw.participante_id as OdooM2O),
    participanteNome: relNome(raw.participante_id as OdooM2O),
    bcComissao: num(raw.bc_comissao),
    alComissao: num(raw.al_comissao),
    vrComissao: num(raw.vr_comissao),
  };
}

export async function rebuildFatoComissao(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawPedidoComissao.findMany({ where: { rawDeleted: false } });
  const mapped = rawRows.map((r) => mapComissaoRow(r.data as Record<string, unknown>));
  await prisma.$transaction(
    async (tx) => {
      await tx.fatoComissao.deleteMany({});
      if (mapped.length) await tx.fatoComissao.createMany({ data: mapped });
      await markFatoBuilt(tx, "fato_comissao");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );
  return mapped.length;
}
