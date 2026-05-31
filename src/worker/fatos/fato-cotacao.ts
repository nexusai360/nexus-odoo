// B4 (comercial): builder de cotações/propostas. Estrutural (0 reg; auto-ativa).
// Fonte: raw_pedido_documento_cotacao (modelo pedido.documento.cotacao).
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";
import { str, bool } from "./_coerce";

export interface FatoCotacaoRow {
  odooId: number;
  numero: string | null;
  status: string | null;
  ehCompra: boolean;
  empresaId: number | null;
  operacaoId: number | null;
  operacaoNome: string | null;
  usuarioAprovadorId: number | null;
  centroResultadoId: number | null;
}

export function mapCotacaoRow(raw: Record<string, unknown>): FatoCotacaoRow {
  return {
    odooId: Number(raw.id),
    numero: str(raw.numero),
    status: str(raw.status),
    ehCompra: bool(raw.eh_compra),
    empresaId: relId(raw.empresa_id as OdooM2O),
    operacaoId: relId(raw.operacao_id as OdooM2O),
    operacaoNome: relNome(raw.operacao_id as OdooM2O),
    usuarioAprovadorId: relId(raw.usuario_aprovador_id as OdooM2O),
    centroResultadoId: relId(raw.centro_resultado_id as OdooM2O),
  };
}

export async function rebuildFatoCotacao(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawPedidoDocumentoCotacao.findMany({ where: { rawDeleted: false } });
  const mapped = rawRows.map((r) => mapCotacaoRow(r.data as Record<string, unknown>));
  await prisma.$transaction(
    async (tx) => {
      await tx.fatoCotacao.deleteMany({});
      if (mapped.length) await tx.fatoCotacao.createMany({ data: mapped });
      await markFatoBuilt(tx, "fato_cotacao");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );
  return mapped.length;
}
