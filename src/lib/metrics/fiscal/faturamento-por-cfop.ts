import type { Prisma, PrismaClient } from "../../../generated/prisma/client";
import type { FaturamentoInput } from "../_shared/types";
import { buildPeriodoWhere } from "../_shared/periodo";
import { buildEmpresaWhere } from "../_shared/empresa";
import { classificarCfop, extrairCfop, ROTULO_CATEGORIA } from "../../fiscal/regras";
import type { CategoriaGerencial } from "../../fiscal/regras";

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
  valorProdutos: number;
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
  totalReceita: number;
  totalNaoReceita: number;
  semCfop: { totalItens: number; valorProdutos: number };
  /** Fase 2.6: decomposicao do balde sem_cfop por finalidade (1=venda candidata, 4=devolucao). */
  semCfopPorFinalidade: SemCfopFinalidade[];
  /** Fase 2.6: balde "outras" (CFOP 5949/6949), substancia indefinida (a confirmar com o cliente). */
  outrasNaoEspecificadas: OutrasNaoEspecificadas;
  reconciliacao: Reconciliacao;
}

interface GrupoClassificado {
  cfop4: string | null;
  categoria: CategoriaGerencial;
  ehReceita: boolean;
  rotuloCfop: string; // nome limpo do CFOP (ou "Sem CFOP")
  totalItens: number;
  valorProdutos: number;
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
  const where: Prisma.FatoNotaFiscalItemWhereInput = {
    entradaSaida: "1",
    situacaoNfe: "autorizada",
    ...buildPeriodoWhere(input.periodoDe, input.periodoAte),
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

  // Classifica cada grupo via Tabela de Regras. Number() converte o Decimal do Prisma.
  const classificados: GrupoClassificado[] = grupos.map((g) => {
    const cfopNome = g.cfopId === null ? null : (nomePorId.get(g.cfopId) ?? null);
    const cfop4 = extrairCfop(cfopNome);
    const regra = classificarCfop(cfop4);
    return {
      cfop4,
      categoria: regra.categoria,
      ehReceita: regra.ehReceita,
      rotuloCfop: cfop4 ? (cfopNome ?? cfop4) : "Sem CFOP",
      totalItens: Number(g._count ?? 0),
      valorProdutos: Number(g._sum.vrProdutos ?? 0),
    };
  });

  // sem_cfop tem ehReceita=false, entao esta DENTRO de totalNaoReceita; semCfop e um
  // subconjunto destacado dele. Invariante: totalReceita + totalNaoReceita === totalProdutos.
  const totalProdutos = classificados.reduce((s, c) => s + c.valorProdutos, 0);
  const totalReceita = classificados.filter((c) => c.ehReceita).reduce((s, c) => s + c.valorProdutos, 0);
  const totalNaoReceita = totalProdutos - totalReceita;

  const semCfopGrupo = classificados.filter((c) => c.categoria === "sem_cfop");
  const semCfop = {
    totalItens: semCfopGrupo.reduce((s, c) => s + c.totalItens, 0),
    valorProdutos: semCfopGrupo.reduce((s, c) => s + c.valorProdutos, 0),
  };

  // Fase 2.6: decomposicao por finalidade (vive so no cabecalho -> JOIN item->nota). Mesmo
  // recorte do where acima (entrada_saida='1', autorizada, periodo, empresa) reproduzido em SQL
  // parametrizado ($queryRawUnsafe + params, para nao importar o VALUE Prisma neste arquivo
  // jest-testado , o client gerado usa import.meta e quebra o jest).
  const params: unknown[] = [];
  let condSql = "i.entrada_saida = '1' AND i.situacao_nfe = 'autorizada'";
  if (input.periodoDe && input.periodoAte) {
    params.push(`${input.periodoDe}T00:00:00Z`, `${input.periodoAte}T00:00:00Z`);
    condSql += ` AND i.data_emissao >= $${params.length - 1}::timestamptz AND i.data_emissao < ($${params.length}::timestamptz + interval '1 day')`;
  }
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
    }));
  } else {
    const porCategoria = new Map<CategoriaGerencial, OperacaoLinha>();
    for (const c of classificados) {
      const atual = porCategoria.get(c.categoria);
      if (atual) {
        atual.totalItens += c.totalItens;
        atual.valorProdutos += c.valorProdutos;
      } else {
        porCategoria.set(c.categoria, {
          chave: c.categoria,
          rotulo: ROTULO_CATEGORIA[c.categoria],
          categoria: c.categoria,
          ehReceita: c.ehReceita,
          totalItens: c.totalItens,
          valorProdutos: c.valorProdutos,
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
    ...buildPeriodoWhere(input.periodoDe, input.periodoAte),
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
    totalNaoReceita,
    semCfop,
    semCfopPorFinalidade,
    outrasNaoEspecificadas,
    reconciliacao,
  };
}
