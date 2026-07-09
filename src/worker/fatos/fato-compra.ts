// A7 (Diretoria): builder de compras (ordens de compra). Cada linha = 1 OC.
// Fonte: raw_pedido_documento (modelo pedido.documento) filtrado por tipo="compra".
// Guarda todas as compras; a query queryComprasAtivas filtra as não recebidas e
// não canceladas. `recebida` = estoque_finalizado do Odoo (entrou no estoque).
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";

const CAMPO_TIPO = "tipo";
const TIPO_COMPRA = "compra";

export interface FatoCompraRow {
  odooId: number;
  numero: string | null;
  etapaId: number | null;
  etapaNome: string | null;
  operacaoId: number | null;
  operacaoNome: string | null;
  fornecedorId: number | null;
  fornecedorNome: string | null;
  compradorId: number | null;
  compradorNome: string | null;
  empresaId: number | null;
  empresaNome: string | null;
  dataOrcamento: Date | null;
  dataPrevista: Date | null;
  dataAprovacao: Date | null;
  vrProdutos: number;
  vrNf: number;
  vrPago: number;
  vrSaldo: number;
  recebida: boolean;
  cancelada: boolean;
}

// Datas do Odoo aqui são "YYYY-MM-DD" (data pura). false/null → null.
function d(v: unknown): Date | null {
  return typeof v === "string" && v ? new Date(`${v}T00:00:00Z`) : null;
}

export function mapCompraRow(raw: Record<string, unknown>): FatoCompraRow {
  return {
    odooId: Number(raw.id),
    numero: typeof raw.numero === "string" ? raw.numero : null,
    etapaId: relId(raw.etapa_id as OdooM2O),
    etapaNome: relNome(raw.etapa_id as OdooM2O),
    operacaoId: relId(raw.operacao_id as OdooM2O),
    operacaoNome: relNome(raw.operacao_id as OdooM2O),
    // No Odoo a compra usa participante_id como fornecedor.
    fornecedorId: relId(raw.participante_id as OdooM2O),
    fornecedorNome: relNome(raw.participante_id as OdooM2O),
    compradorId: relId(raw.comprador_id as OdooM2O),
    compradorNome: relNome(raw.comprador_id as OdooM2O),
    empresaId: relId(raw.empresa_id as OdooM2O),
    empresaNome: relNome(raw.empresa_id as OdooM2O),
    dataOrcamento: d(raw.data_orcamento),
    dataPrevista: d(raw.data_prevista),
    dataAprovacao: d(raw.data_aprovacao),
    vrProdutos: Number(raw.vr_produtos ?? 0),
    vrNf: Number(raw.vr_nf ?? 0),
    vrPago: Number(raw.vr_pago ?? 0),
    vrSaldo: Number(raw.vr_saldo ?? 0),
    recebida: raw.estoque_finalizado === true,
    cancelada: raw.finaliza_pedido_cancelando === true,
  };
}

const CHUNK = 1000;

/** Reconstrói fato_compra a partir de raw_pedido_documento (tipo="compra").
 * Lê só a coluna `data` e insere em chunks para não estourar memória. */
export async function rebuildFatoCompra(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawPedidoDocumento.findMany({
    where: { rawDeleted: false },
    select: { data: true },
  });
  const mapped = rawRows
    .map((r) => r.data as Record<string, unknown>)
    .filter((data) => String(data[CAMPO_TIPO]) === TIPO_COMPRA)
    .map(mapCompraRow);

  await prisma.$transaction(
    async (tx) => {
      await tx.fatoCompra.deleteMany({});
      for (let i = 0; i < mapped.length; i += CHUNK) {
        await tx.fatoCompra.createMany({ data: mapped.slice(i, i + CHUNK) });
      }
      await markFatoBuilt(tx, "fato_compra");
    },
    { timeout: 300_000, maxWait: 15_000 },
  );
  return mapped.length;
}
