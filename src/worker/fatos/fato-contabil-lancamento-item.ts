// B1 (onda contábil): builder das partidas/itens do lançamento (coração da
// contabilidade). Estrutural (0 reg hoje). Denormaliza, via join no rebuild:
//   - contaNatureza/contaCodigo: de fato_conta_contabil (pelo conta_id do item);
//   - lancamentoTipo: de fato_contabil_lancamento (pelo lancamento_id do item),
//     necessário para excluir lançamentos de Encerramento no resultado.
// Fonte: raw_contabil_lancamento_item (modelo contabil.lancamento.item).
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";

/** Atributos da conta da empresa, indexados por odooId, para denormalizar. */
export interface ContaInfo {
  natureza: string | null;
  codigo: string | null;
}

/** Mapas auxiliares de denormalização (lidos dos fatos pais no rebuild). */
export interface ItemDenormMaps {
  contaPorId: Map<number, ContaInfo>;
  tipoPorLancamento: Map<number, string | null>;
}

export interface FatoContabilLancamentoItemRow {
  odooId: number;
  lancamentoId: number | null;
  lancamentoTipo: string | null;
  contaId: number | null;
  contaCodigo: string | null;
  contaNome: string | null;
  contaNatureza: string | null;
  centroCustoId: number | null;
  centroCustoNome: string | null;
  natureza: string | null;
  valor: number;
  valorDebito: number;
  valorCredito: number;
  dataLancamento: Date | null;
  historico: string | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number => (typeof v === "number" ? v : 0);
const dt = (v: unknown): Date | null =>
  typeof v === "string" && v ? new Date(v.replace(" ", "T")) : null;

export function mapContabilLancamentoItemRow(
  raw: Record<string, unknown>,
  maps: ItemDenormMaps,
): FatoContabilLancamentoItemRow {
  const lancamentoId = relId(raw.lancamento_id as OdooM2O);
  const contaId = relId(raw.conta_id as OdooM2O);
  const conta = contaId != null ? maps.contaPorId.get(contaId) : undefined;
  return {
    odooId: Number(raw.id),
    lancamentoId,
    lancamentoTipo: lancamentoId != null ? (maps.tipoPorLancamento.get(lancamentoId) ?? null) : null,
    contaId,
    // contaCodigo vem do fato_conta_contabil (o item não traz o código direto).
    contaCodigo: conta?.codigo ?? null,
    contaNome: relNome(raw.conta_id as OdooM2O),
    // contaNatureza: 01..09 da conta da empresa (04=Resultado p/ o resultado por natureza).
    contaNatureza: conta?.natureza ?? null,
    centroCustoId: relId(raw.centro_custo_id as OdooM2O),
    centroCustoNome: relNome(raw.centro_custo_id as OdooM2O),
    // natureza D/C da partida.
    natureza: str(raw.natureza),
    // CONFIRMAR na ativação: valor vs valor_debito/valor_credito (qual a Matrix popula).
    valor: num(raw.valor),
    valorDebito: num(raw.valor_debito),
    valorCredito: num(raw.valor_credito),
    dataLancamento: dt(raw.data_lancamento),
    historico: str(raw.historico_completo),
  };
}

export async function rebuildFatoContabilLancamentoItem(prisma: PrismaClient): Promise<number> {
  // Mapas de denormalização. Dependem de fato_conta_contabil já populado (plano da
  // empresa, real) e de fato_contabil_lancamento (cabeçalho, mesma onda , ordem
  // garantida no FATO_BUILDERS: cabeçalho antes do item).
  const contas = await prisma.fatoContaContabil.findMany({
    select: { odooId: true, natureza: true, codigo: true },
  });
  const contaPorId = new Map<number, ContaInfo>(
    contas.map((c) => [c.odooId, { natureza: c.natureza, codigo: c.codigo }]),
  );
  const lancamentos = await prisma.fatoContabilLancamento.findMany({
    select: { odooId: true, tipo: true },
  });
  const tipoPorLancamento = new Map<number, string | null>(
    lancamentos.map((l) => [l.odooId, l.tipo]),
  );
  const maps: ItemDenormMaps = { contaPorId, tipoPorLancamento };

  const rawRows = await prisma.rawContabilLancamentoItem.findMany({
    where: { rawDeleted: false },
  });
  const mapped = rawRows.map((r) =>
    mapContabilLancamentoItemRow(r.data as Record<string, unknown>, maps),
  );

  await prisma.$transaction(
    async (tx) => {
      await tx.fatoContabilLancamentoItem.deleteMany({});
      if (mapped.length) {
        await tx.fatoContabilLancamentoItem.createMany({ data: mapped });
      }
      await markFatoBuilt(tx, "fato_contabil_lancamento_item");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );

  return mapped.length;
}
