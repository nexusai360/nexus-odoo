// src/worker/fatos/fato-preco.ts
// FONTE: raw_sped_tabela_preco_regra (modelo sped.tabela.preco.regra).
// ESCOPO: regras de preço das tabelas de preço da Matrix Fitness Group.
// GRÃO: uma linha por regra. A dimensão indica o alvo da regra: produto,
//   família, participante ou geral. O `valor` é resolvido quando a operação
//   é direta (fixo/valor); operações relativas (margem, markup, desconto)
//   guardam o percentual em `aliquota` e deixam `valor` nulo.
// CYCLE: incremental — ~12k regras, mudam pouco.
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";

export interface FatoPrecoRow {
  odooId: number;
  tabelaId: number | null;
  tabelaNome: string | null;
  dimensao: string;
  produtoId: number | null;
  produtoNome: string | null;
  familiaId: number | null;
  familiaNome: string | null;
  participanteId: number | null;
  participanteNome: string | null;
  operacao: string | null;
  precoBase: string | null;
  valor: number | null;
  aliquota: number | null;
  quantidadeMinima: number;
  dataInicial: Date | null;
  dataFinal: Date | null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Datas do Odoo vêm como "YYYY-MM-DD" ou false. */
function dateOrNull(v: unknown): Date | null {
  if (typeof v !== "string" || v.length < 8) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function mapPrecoRegraRow(raw: Record<string, unknown>): FatoPrecoRow {
  const produtoId = relId(raw.produto_id as OdooM2O);
  const familiaId = relId(raw.familia_id as OdooM2O);
  const participanteId = relId(raw.participante_id as OdooM2O);
  const operacao = str(raw.operacao_produto);
  const vrFixo = num(raw.vr_fixo_produto);
  const vrRegra = num(raw.vr_regra_produto);

  // valor resolvido só para operações diretas; relativas ficam em `aliquota`.
  let valor: number | null = null;
  if (operacao === "fixo") valor = vrFixo;
  else if (operacao === "valor") valor = vrRegra;

  const dimensao = produtoId
    ? "produto"
    : familiaId
      ? "familia"
      : participanteId
        ? "participante"
        : "geral";

  return {
    odooId: Number(raw.id),
    tabelaId: relId(raw.tabela_id as OdooM2O),
    tabelaNome: relNome(raw.tabela_id as OdooM2O),
    dimensao,
    produtoId,
    produtoNome: relNome(raw.produto_id as OdooM2O),
    familiaId,
    familiaNome: relNome(raw.familia_id as OdooM2O),
    participanteId,
    participanteNome: relNome(raw.participante_id as OdooM2O),
    operacao,
    precoBase: str(raw.preco_base_produto),
    valor,
    aliquota: num(raw.al_regra_produto),
    quantidadeMinima: num(raw.quantidade_minima) ?? 0,
    dataInicial: dateOrNull(raw.data_inicial),
    dataFinal: dateOrNull(raw.data_final),
  };
}

/** Reconstrói fato_preco a partir de raw_sped_tabela_preco_regra. */
export async function rebuildFatoPreco(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawSpedTabelaPrecoRegra.findMany({
    where: { rawDeleted: false },
  });
  const mapped = rawRows.map((r) => mapPrecoRegraRow(r.data as Record<string, unknown>));
  await prisma.$transaction(async (tx) => {
    await tx.fatoPreco.deleteMany({});
    if (mapped.length) {
      await tx.fatoPreco.createMany({ data: mapped });
    }
    await markFatoBuilt(tx, "fato_preco");
  });
  return mapped.length;
}
