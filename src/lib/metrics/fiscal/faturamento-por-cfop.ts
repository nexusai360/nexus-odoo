import type { Prisma, PrismaClient } from "../../../generated/prisma/client";
import type { FaturamentoInput } from "../_shared/types";
import { buildPeriodoWhere } from "../_shared/periodo";
import { buildEmpresaWhere } from "../_shared/empresa";
import { classificarCfop, extrairCfop, ROTULO_CATEGORIA } from "../../fiscal/regras";
import type { CategoriaGerencial } from "../../fiscal/regras";
import { carregarItensVendaComGrupo } from "./_itens-venda-grupo";
import { janelaClampada } from "@/lib/corte-dados";

export interface FaturamentoOperacaoInput extends FaturamentoInput {
  /** 'categoria' (default) agrega por categoria gerencial; 'cfop' lista por CFOP. */
  agruparPor?: "cfop" | "categoria";
}

export interface OperacaoLinha {
  chave: string; // "5102" (cfop) ou "venda" (categoria)
  rotulo: string; // nome limpo do CFOP ou rotulo da categoria
  categoria: CategoriaGerencial;
  ehReceita: boolean;
  totalItens: number;
  valorProdutos: number; // BRUTO (inclui vendas intragrupo)
  /** Parcela desta linha que e venda INTRAGRUPO (entre empresas do grupo). */
  valorIntragrupo: number;
  /** Faturamento REAL desta linha (valorProdutos - valorIntragrupo). */
  valorReal: number;
}

export interface Reconciliacao {
  somaProdutosItens: number;
  somaProdutosNotas: number;
  diferenca: number;
  observacao: string;
}

export interface SemCfopFinalidade {
  finalidade: string;
  totalItens: number;
  valorProdutos: number;
}

export interface OutrasNaoEspecificadas {
  totalItens: number;
  valorProdutos: number;
  /** parcela com finalidade_nfe='1' (saida normal); substancia A CONFIRMAR, NAO "venda". */
  valorFinalidadeVenda: number;
}

export interface FaturamentoPorCfopResultado {
  agruparPor: "cfop" | "categoria";
  linhas: OperacaoLinha[];
  total: number; // numero de linhas (full-set, antes do limit)
  totalProdutos: number;
  totalReceita: number; // BRUTO (inclui receita intragrupo)
  /** Receita REAL: ex-intragrupo (= totalReceita - receitaIntragrupo). E o
   *  "faturamento verdadeiro" da empresa por essas operacoes. */
  totalReceitaReal: number;
  /** Receita de venda INTRAGRUPO (eliminada no consolidado do grupo). */
  receitaIntragrupo: number;
  totalNaoReceita: number;
  semCfop: { totalItens: number; valorProdutos: number };
  /** Fase 2.6: decomposicao do balde sem_cfop por finalidade (1=venda candidata, 4=devolucao). */
  semCfopPorFinalidade: SemCfopFinalidade[];
  /** Fase 2.6: balde "outras" (CFOP 5949/6949), substancia indefinida (a confirmar com o cliente). */
  outrasNaoEspecificadas: OutrasNaoEspecificadas;
  reconciliacao: Reconciliacao;
}

interface GrupoClassificado {
  cfopId: number | null;
  cfop4: string | null;
  categoria: CategoriaGerencial;
  ehReceita: boolean;
  rotuloCfop: string; // nome limpo do CFOP (ou "Sem CFOP")
  totalItens: number;
  valorProdutos: number;
  valorIntragrupo: number;
}

/**
 * FATURAMENTO POR OPERACAO FISCAL. Base = item.vrProdutos (escolha do usuario;
 * difere do vr_nf rateado em ~0,0015%). groupBy nativo por cfopId, classificacao
 * em memoria via Tabela de Regras (src/lib/fiscal/regras). Saida em dois modos:
 * por categoria gerencial (default) ou por CFOP cru. totalReceita soma so ehReceita.
 * Reconcilia a soma dos itens com o vrProdutos do cabecalho (fato_nota_fiscal).
 */
export async function faturamentoPorCfop(
  prisma: PrismaClient,
  input: FaturamentoOperacaoInput,
): Promise<FaturamentoPorCfopResultado> {
  const agruparPor = input.agruparPor ?? "categoria";
  // Fonte UNICA do recorte de data (ja grampeado a data de inicio das analises): o groupBy, o
  // cabecalho da reconciliacao e os blocos de SQL cru mais abaixo bebem todos daqui. Se cada um
  // montasse o seu, a resposta se contradiria (balde somando item que o total nao ve).
  const periodoWhere = buildPeriodoWhere(input.periodoDe, input.periodoAte);
  const where: Prisma.FatoNotaFiscalItemWhereInput = {
    entradaSaida: "1",
    situacaoNfe: "autorizada",
    ...periodoWhere,
    ...buildEmpresaWhere(input.empresaId),
  };

  const grupos = await prisma.fatoNotaFiscalItem.groupBy({
    by: ["cfopId"],
    _sum: { vrProdutos: true },
    _count: true,
    where,
  });

  const ids = grupos.map((g) => g.cfopId).filter((x): x is number => x !== null);
  const nomeRows = ids.length
    ? await prisma.fatoNotaFiscalItem.findMany({
        where: { cfopId: { in: ids } },
        select: { cfopId: true, cfopNome: true },
        distinct: ["cfopId"],
      })
    : [];
  const nomePorId = new Map(nomeRows.map((r) => [r.cfopId, r.cfopNome]));

  // REAL (ex-intragrupo): usa o MESMO loader/definicao de intragrupo da
  // receitaConsolidada (whitelist->cadastro->nome), agregando o valor intragrupo
  // por cfopId. Assim a quebra por CFOP separa o que e venda PARA FORA (real) do
  // que e venda entre empresas do grupo (eliminada no consolidado). Mesma base
  // (item.vrProdutos) e mesmo recorte (saida autorizada, periodo, empresa).
  const { itens } = await carregarItensVendaComGrupo(prisma, input);
  const intragrupoPorCfopId = new Map<number | null, number>();
  for (const it of itens) {
    if (!it.intragrupo) continue;
    intragrupoPorCfopId.set(
      it.cfopId,
      (intragrupoPorCfopId.get(it.cfopId) ?? 0) + it.valorProdutos,
    );
  }

  // Classifica cada grupo via Tabela de Regras. Number() converte o Decimal do Prisma.
  const classificados: GrupoClassificado[] = grupos.map((g) => {
    const cfopNome = g.cfopId === null ? null : (nomePorId.get(g.cfopId) ?? null);
    const cfop4 = extrairCfop(cfopNome);
    const regra = classificarCfop(cfop4);
    return {
      cfopId: g.cfopId,
      cfop4,
      categoria: regra.categoria,
      ehReceita: regra.ehReceita,
      rotuloCfop: cfop4 ? (cfopNome ?? cfop4) : "Sem CFOP",
      totalItens: Number(g._count ?? 0),
      valorProdutos: Number(g._sum.vrProdutos ?? 0),
      valorIntragrupo: intragrupoPorCfopId.get(g.cfopId) ?? 0,
    };
  });

  // sem_cfop tem ehReceita=false, entao esta DENTRO de totalNaoReceita; semCfop e um
  // subconjunto destacado dele. Invariante: totalReceita + totalNaoReceita === totalProdutos.
  const totalProdutos = classificados.reduce((s, c) => s + c.valorProdutos, 0);
  const totalReceita = classificados.filter((c) => c.ehReceita).reduce((s, c) => s + c.valorProdutos, 0);
  const totalNaoReceita = totalProdutos - totalReceita;
  // Receita intragrupo = parcela das linhas de RECEITA que e venda entre empresas
  // do grupo; o real e a receita bruta menos isso.
  const receitaIntragrupo = classificados
    .filter((c) => c.ehReceita)
    .reduce((s, c) => s + c.valorIntragrupo, 0);
  const totalReceitaReal = totalReceita - receitaIntragrupo;

  const semCfopGrupo = classificados.filter((c) => c.categoria === "sem_cfop");
  const semCfop = {
    totalItens: semCfopGrupo.reduce((s, c) => s + c.totalItens, 0),
    valorProdutos: semCfopGrupo.reduce((s, c) => s + c.valorProdutos, 0),
  };

  // Fase 2.6: decomposicao por finalidade (vive so no cabecalho -> JOIN item->nota). Mesmo
  // recorte do where acima (entrada_saida='1', autorizada, periodo, empresa) reproduzido em SQL
  // parametrizado ($queryRawUnsafe + params, para nao importar o VALUE Prisma neste arquivo
  // jest-testado , o client gerado usa import.meta e quebra o jest).
  //
  // Os limites de data saem do MESMO periodoWhere dos totais (nunca de input.periodoDe cru):
  // e o que garante que semCfopPorFinalidade e outrasNaoEspecificadas fechem com totalProdutos
  // e respeitem a data de inicio das analises, inclusive quando o chamador nao manda periodo
  // (o piso vira o corte). O `??` e so pelo tipo: buildPeriodoWhere sempre devolve o recorte.
  const janela = periodoWhere.dataEmissao ?? janelaClampada(input.periodoDe, input.periodoAte);
  const params: unknown[] = [janela.gte.toISOString(), janela.lt.toISOString()];
  let condSql =
    "i.entrada_saida = '1' AND i.situacao_nfe = 'autorizada'" +
    " AND i.data_emissao >= $1::timestamptz AND i.data_emissao < $2::timestamptz";
  if (input.empresaId !== undefined) {
    params.push(input.empresaId);
    condSql += ` AND i.empresa_id = $${params.length}`;
  }

  type FinRow = { finalidade: string | null; n: bigint; v: Prisma.Decimal | null };
  const semCfopFinRows = await prisma.$queryRawUnsafe<FinRow[]>(
    `SELECT nf.finalidade_nfe AS finalidade, COUNT(*) n, COALESCE(SUM(i.vr_produtos),0) v
     FROM fato_nota_fiscal_item i JOIN fato_nota_fiscal nf ON nf.odoo_id = i.documento_id
     WHERE ${condSql} AND i.cfop_id IS NULL GROUP BY nf.finalidade_nfe ORDER BY v DESC`,
    ...params,
  );
  const semCfopPorFinalidade: SemCfopFinalidade[] = semCfopFinRows.map((r) => ({
    finalidade: r.finalidade ?? "(sem)",
    totalItens: Number(r.n),
    valorProdutos: Number(r.v ?? 0),
  }));

  const outrasRows = await prisma.$queryRawUnsafe<FinRow[]>(
    `SELECT nf.finalidade_nfe AS finalidade, COUNT(*) n, COALESCE(SUM(i.vr_produtos),0) v
     FROM fato_nota_fiscal_item i JOIN fato_nota_fiscal nf ON nf.odoo_id = i.documento_id
     WHERE ${condSql} AND (i.cfop_nome LIKE '5949%' OR i.cfop_nome LIKE '6949%') GROUP BY nf.finalidade_nfe`,
    ...params,
  );
  const outrasNaoEspecificadas: OutrasNaoEspecificadas = {
    totalItens: outrasRows.reduce((s, r) => s + Number(r.n), 0),
    valorProdutos: outrasRows.reduce((s, r) => s + Number(r.v ?? 0), 0),
    valorFinalidadeVenda: outrasRows.filter((r) => r.finalidade === "1").reduce((s, r) => s + Number(r.v ?? 0), 0),
  };

  // Monta as linhas conforme o modo.
  let linhas: OperacaoLinha[];
  if (agruparPor === "cfop") {
    linhas = classificados.map((c) => ({
      chave: c.cfop4 ?? "sem_cfop",
      rotulo: c.rotuloCfop,
      categoria: c.categoria,
      ehReceita: c.ehReceita,
      totalItens: c.totalItens,
      valorProdutos: c.valorProdutos,
      valorIntragrupo: c.valorIntragrupo,
      valorReal: c.valorProdutos - c.valorIntragrupo,
    }));
  } else {
    const porCategoria = new Map<CategoriaGerencial, OperacaoLinha>();
    for (const c of classificados) {
      const atual = porCategoria.get(c.categoria);
      if (atual) {
        atual.totalItens += c.totalItens;
        atual.valorProdutos += c.valorProdutos;
        atual.valorIntragrupo += c.valorIntragrupo;
        atual.valorReal = atual.valorProdutos - atual.valorIntragrupo;
      } else {
        porCategoria.set(c.categoria, {
          chave: c.categoria,
          rotulo: ROTULO_CATEGORIA[c.categoria],
          categoria: c.categoria,
          ehReceita: c.ehReceita,
          totalItens: c.totalItens,
          valorProdutos: c.valorProdutos,
          valorIntragrupo: c.valorIntragrupo,
          valorReal: c.valorProdutos - c.valorIntragrupo,
        });
      }
    }
    linhas = [...porCategoria.values()];
  }
  linhas.sort((a, b) => b.valorProdutos - a.valorProdutos);
  const total = linhas.length;

  // Reconciliacao: soma vrProdutos do cabecalho no mesmo where (sem cfop no header).
  const headerWhere: Prisma.FatoNotaFiscalWhereInput = {
    entradaSaida: "1",
    situacaoNfe: "autorizada",
    ...periodoWhere,
    ...buildEmpresaWhere(input.empresaId),
  };
  const headerAgg = await prisma.fatoNotaFiscal.aggregate({ _sum: { vrProdutos: true }, where: headerWhere });
  const somaProdutosNotas = Number(headerAgg._sum.vrProdutos ?? 0);
  const diferenca = totalProdutos - somaProdutosNotas;
  const pct = somaProdutosNotas !== 0 ? (Math.abs(diferenca) / somaProdutosNotas) * 100 : 0;
  const reconciliacao: Reconciliacao = {
    somaProdutosItens: totalProdutos,
    somaProdutosNotas,
    diferenca,
    observacao: `Itens e cabecalho diferem em ${pct.toFixed(4)}% (R$ ${diferenca.toFixed(2)}), atribuivel a notas de saida sem item.`,
  };

  // Paginacao do full-set (apos ordenar).
  if (input.limit !== undefined) {
    const off = input.offset ?? 0;
    linhas = linhas.slice(off, off + input.limit);
  }

  return {
    agruparPor,
    linhas,
    total,
    totalProdutos,
    totalReceita,
    totalReceitaReal,
    receitaIntragrupo,
    totalNaoReceita,
    semCfop,
    semCfopPorFinalidade,
    outrasNaoEspecificadas,
    reconciliacao,
  };
}
