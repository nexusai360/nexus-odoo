import type { PrismaClient } from "../../../generated/prisma/client";
import type { FaturamentoInput } from "../_shared/types";
import { classificarCfop, extrairCfop } from "../../fiscal/regras";

/**
 * MARGEM BRUTA APROXIMADA (Fase 4). receita de venda - custo estimado (Σ quantidade x
 * preco_custo do produto). APROXIMADA e NAO e lucro: (a) preco_custo e o custo ATUAL do
 * produto (snapshot), aplicado retroativamente -> margem de periodos antigos e nao-confiavel
 * (default = ano corrente); (b) cobertura < 100% (produtos sem custo ficam de fora da margem);
 * (c) sem despesas/impostos/rateios. Sem contabil (DRE bloqueado).
 *
 * Fonte UNICA: 1 query agregada por cfop_nome (JOIN item->fato_produto). A classificacao
 * "e venda?" (ehReceita) e feita em TS via classificarCfop , a MESMA de faturamentoPorCfop,
 * garantindo base coerente entre receita e custo. $queryRawUnsafe parametrizado (nao importa o
 * VALUE Prisma; o client gerado usa import.meta e quebra o jest).
 */
export interface MargemAproximadaResultado {
  receitaVendaTotal: number;
  receitaComCusto: number;
  custoEstimado: number;
  margemBrutaAproximada: number;
  percentualMargem: number;
  coberturaCusto: number;
  receitaSemCusto: number;
  /** true quando >10% dos itens de venda com custo tem custo > receita (proxy de custo defasado). */
  custoDesatualizadoProvavel: boolean;
}

interface CfopRow {
  cfop_nome: string | null;
  vr: number;
  vr_com_custo: number;
  custo: number;
  itens_com_custo: number;
  itens_custo_maior: number;
}

export async function margemAproximada(
  prisma: PrismaClient,
  input: FaturamentoInput,
): Promise<MargemAproximadaResultado> {
  const params: unknown[] = [];
  let cond = "i.entrada_saida = '1' AND i.situacao_nfe = 'autorizada'";
  if (input.periodoDe && input.periodoAte) {
    params.push(`${input.periodoDe}T00:00:00Z`, `${input.periodoAte}T00:00:00Z`);
    cond += ` AND i.data_emissao >= $${params.length - 1}::timestamptz AND i.data_emissao < ($${params.length}::timestamptz + interval '1 day')`;
  }
  if (input.empresaId !== undefined) {
    params.push(input.empresaId);
    cond += ` AND i.empresa_id = $${params.length}`;
  }

  const rows = await prisma.$queryRawUnsafe<CfopRow[]>(
    `SELECT i.cfop_nome,
            COALESCE(SUM(i.vr_produtos),0)::float8 vr,
            COALESCE(SUM(i.vr_produtos) FILTER (WHERE p.preco_custo IS NOT NULL),0)::float8 vr_com_custo,
            COALESCE(SUM(i.quantidade * p.preco_custo) FILTER (WHERE p.preco_custo IS NOT NULL),0)::float8 custo,
            COUNT(*) FILTER (WHERE p.preco_custo IS NOT NULL)::int itens_com_custo,
            COUNT(*) FILTER (WHERE p.preco_custo IS NOT NULL AND (i.quantidade * p.preco_custo) > i.vr_produtos)::int itens_custo_maior
     FROM fato_nota_fiscal_item i
     LEFT JOIN fato_produto p ON p.odoo_id = i.produto_id
     WHERE ${cond}
     GROUP BY i.cfop_nome`,
    ...params,
  );

  let receitaVendaTotal = 0;
  let receitaComCusto = 0;
  let custoEstimado = 0;
  let itensComCusto = 0;
  let itensCustoMaior = 0;
  for (const r of rows) {
    if (!classificarCfop(extrairCfop(r.cfop_nome)).ehReceita) continue; // so venda/servico/exportacao
    receitaVendaTotal += Number(r.vr);
    receitaComCusto += Number(r.vr_com_custo);
    custoEstimado += Number(r.custo);
    itensComCusto += Number(r.itens_com_custo);
    itensCustoMaior += Number(r.itens_custo_maior);
  }

  const margemBrutaAproximada = receitaComCusto - custoEstimado;
  const percentualMargem = receitaComCusto > 0 ? margemBrutaAproximada / receitaComCusto : 0;
  const coberturaCusto = receitaVendaTotal > 0 ? receitaComCusto / receitaVendaTotal : 0;
  const custoDesatualizadoProvavel = itensComCusto > 0 && itensCustoMaior / itensComCusto > 0.1;

  return {
    receitaVendaTotal,
    receitaComCusto,
    custoEstimado,
    margemBrutaAproximada,
    percentualMargem,
    coberturaCusto,
    receitaSemCusto: receitaVendaTotal - receitaComCusto,
    custoDesatualizadoProvavel,
  };
}
