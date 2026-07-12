// Queries de Vendas da Diretoria (módulo C do HTML). Próprias da Diretoria para
// não tocar os arquivos compartilhados de relatórios. Padrão do projeto:
// recebem (prisma, filtros), agregam em memória, retornam linhas ordenadas.

import type { PrismaClient } from "@/generated/prisma/client";

import { corteAtualDate, janelaClampada } from "@/lib/corte-dados";
import { siglaDeUf } from "@/lib/diretoria/uf";
import { buildEmpresaWhere } from "@/lib/metrics/_shared/empresa";

export interface FiltrosVendas {
  periodoDe?: string;
  periodoAte?: string;
  /** Recorte geográfico (UF-scoping); vazio/undefined = todas as UFs. */
  ufs?: string[];
  /** Recorte por empresa do grupo (empresaId do fato); undefined = grupo inteiro. */
  empresaId?: number;
}

/**
 * Recorte de período de qualquer campo de data destas queries, já grampeado à data de
 * início das análises (`sync.corte_dados`). Notas e pedidos são documentos com data, ou
 * seja, histórico: o piso vale sempre.
 *
 * Duas garantias: período anterior ao corte é puxado para o corte, e período AUSENTE não
 * significa "tudo" , significa "do corte em diante". Antes, sem o par completo o filtro
 * era `{}` e o construtor de relatórios (que chama sem período) varria o cache inteiro.
 * A borda final é exclusiva (`lt` = dia seguinte), então o último dia entra por completo.
 */
function periodoWhere(
  de: string | undefined,
  ate: string | undefined,
  campo: string,
): Record<string, unknown> {
  const j = janelaClampada(de, ate);
  return { [campo]: { gte: j.gte, lt: j.lt } };
}

// Faturamento REAL = venda a cliente EXTERNO. Usa a coluna materializada
// `fato_nota_fiscal.is_venda_externa` (saída + autorizada + modelo 55 + CFOP de
// receita + NÃO intragrupo), a MESMA verdade do Agente Nex e das métricas
// canônicas (mesma fonte, mesma verdade). O filtro antigo por natureza/CFOP
// "%venda%" NÃO excluía venda entre empresas do grupo e inflava ~74% (R$167,6M vs
// R$96,2M reais). Para pedidos, o equivalente é `categoria_operacao='venda'`.
const SO_VENDA_NOTA = { isVendaExterna: true as const };
const SO_VENDA_PEDIDO = { categoriaOperacao: "venda" as const };

export interface LinhaFormaPagamento {
  formaPagamento: string;
  quantidade: number;
  valorTotal: number;
}

/**
 * C10 , Formas de pagamento no período. Agrega o valor das parcelas por forma de
 * pagamento (`formaPagamentoNome`), filtrando por `dataVencimento`. Parcelas sem
 * forma definida entram como "Não informado".
 *
 * Dois pisos, porque a parcela é um título de um DOCUMENTO: o vencimento é grampeado à
 * data de início das análises (janela), e a parcela só conta se o PEDIDO de origem também
 * for de dentro da janela coberta. Sem o piso pelo documento, uma parcela de pedido antigo
 * que vence dentro do período entraria no gráfico , o corte é sobre o documento, não sobre
 * o vencimento. Parcela sem pedido de origem fica de fora (não há documento para datar).
 */
export async function queryFormasPagamento(
  prisma: PrismaClient,
  filtros: FiltrosVendas,
): Promise<{ linhas: LinhaFormaPagamento[]; valorGeral: number }> {
  const pedidos = await prisma.fatoPedido.findMany({
    where: { dataOrcamento: { gte: corteAtualDate() } },
    select: { odooId: true },
  });
  const rows = await prisma.fatoPedidoParcela.findMany({
    where: {
      ...periodoWhere(filtros.periodoDe, filtros.periodoAte, "dataVencimento"),
      pedidoId: { in: pedidos.map((p) => p.odooId) },
    },
    select: { formaPagamentoNome: true, valor: true },
  });

  const map = new Map<string, { quantidade: number; valorTotal: number }>();
  let valorGeral = 0;
  for (const r of rows) {
    const key = r.formaPagamentoNome ?? "Não informado";
    const v = Number(r.valor);
    const cur = map.get(key);
    if (cur) {
      cur.quantidade += 1;
      cur.valorTotal += v;
    } else {
      map.set(key, { quantidade: 1, valorTotal: v });
    }
    valorGeral += v;
  }

  const linhas = [...map.entries()]
    .map(([formaPagamento, v]) => ({ formaPagamento, ...v }))
    .sort(
      (a, b) =>
        b.valorTotal - a.valorTotal || a.formaPagamento.localeCompare(b.formaPagamento),
    );

  return { linhas, valorGeral };
}

/**
 * IDs das notas de VENDA EXTERNA no período (fonte materializada). Usado pelas
 * queries item-a-item (marca, margem), já que o item (`fato_nota_fiscal_item`)
 * não carrega `is_venda_externa`; ele liga à nota por `documento_id`.
 */
async function idsNotasVendaExterna(
  prisma: PrismaClient,
  filtros: FiltrosVendas,
): Promise<number[]> {
  const notas = await prisma.fatoNotaFiscal.findMany({
    where: {
      ...SO_VENDA_NOTA,
      ...buildEmpresaWhere(filtros.empresaId),
      ...periodoWhere(filtros.periodoDe, filtros.periodoAte, "dataEmissao"),
    },
    select: { odooId: true },
  });
  return notas.map((n) => n.odooId);
}

export interface LinhaMarca {
  marca: string;
  quantidade: number;
  valorTotal: number;
}

/**
 * C4 , Vendas por marca. Soma o valor dos itens de nota fiscal de SAÍDA
 * (entradaSaida = "1") do período, agrupado pela marca do produto
 * (`fato_produto.marcaNome` via join por `produtoId`). Itens sem marca entram
 * como "Sem marca".
 */
export async function queryVendasPorMarca(
  prisma: PrismaClient,
  filtros: FiltrosVendas,
): Promise<{ linhas: LinhaMarca[]; valorGeral: number }> {
  const notaIds = await idsNotasVendaExterna(prisma, filtros);
  const itens = notaIds.length
    ? await prisma.fatoNotaFiscalItem.findMany({
        where: { documentoId: { in: notaIds } },
        select: { produtoId: true, vrProdutos: true },
      })
    : [];

  const produtoIds = [
    ...new Set(
      itens.map((i) => i.produtoId).filter((x): x is number => x != null),
    ),
  ];
  const produtos = produtoIds.length
    ? await prisma.fatoProduto.findMany({
        where: { odooId: { in: produtoIds } },
        select: { odooId: true, marcaNome: true },
      })
    : [];
  const marcaPorProduto = new Map(
    produtos.map((p) => [p.odooId, p.marcaNome ?? "Sem marca"]),
  );

  const map = new Map<string, { quantidade: number; valorTotal: number }>();
  let valorGeral = 0;
  for (const it of itens) {
    const marca =
      it.produtoId != null
        ? marcaPorProduto.get(it.produtoId) ?? "Sem marca"
        : "Sem marca";
    const v = Number(it.vrProdutos);
    const cur = map.get(marca);
    if (cur) {
      cur.quantidade += 1;
      cur.valorTotal += v;
    } else {
      map.set(marca, { quantidade: 1, valorTotal: v });
    }
    valorGeral += v;
  }

  const linhas = [...map.entries()]
    .map(([marca, v]) => ({ marca, ...v }))
    .sort(
      (a, b) => b.valorTotal - a.valorTotal || a.marca.localeCompare(b.marca),
    );

  return { linhas, valorGeral };
}

export interface LinhaUf {
  uf: string;
  quantidade: number;
  valorTotal: number;
}

/**
 * C3 , Vendas por estado (UF). Soma o valor das notas fiscais de SAÍDA
 * autorizadas do período, agrupado pela UF do cliente (`fato_parceiro.uf` via
 * join por `participanteId`). Respeita o UF-scoping (`filtros.ufs`): se
 * informado, só agrega essas UFs. Notas sem UF resolvida entram como "??".
 * Alimenta o Mapa do Brasil e o comparativo de estados (C8/C9).
 */
export async function queryVendasPorUf(
  prisma: PrismaClient,
  filtros: FiltrosVendas,
): Promise<{ linhas: LinhaUf[]; valorGeral: number }> {
  const notas = await prisma.fatoNotaFiscal.findMany({
    where: {
      ...SO_VENDA_NOTA,
      ...buildEmpresaWhere(filtros.empresaId),
      ...periodoWhere(filtros.periodoDe, filtros.periodoAte, "dataEmissao"),
    },
    select: { participanteId: true, vrNf: true },
  });

  const partIds = [
    ...new Set(
      notas.map((n) => n.participanteId).filter((x): x is number => x != null),
    ),
  ];
  const parceiros = partIds.length
    ? await prisma.fatoParceiro.findMany({
        where: { odooId: { in: partIds } },
        select: { odooId: true, uf: true },
      })
    : [];
  // fato_parceiro.uf guarda o NOME do estado ("São Paulo (BR)"); normaliza p/ sigla.
  const ufPorParceiro = new Map(
    parceiros.map((p) => [p.odooId, siglaDeUf(p.uf) ?? "??"]),
  );

  const escopo = filtros.ufs && filtros.ufs.length ? new Set(filtros.ufs) : null;

  const map = new Map<string, { quantidade: number; valorTotal: number }>();
  let valorGeral = 0;
  for (const n of notas) {
    const uf =
      n.participanteId != null ? ufPorParceiro.get(n.participanteId) ?? "??" : "??";
    if (escopo && !escopo.has(uf)) continue; // UF-scoping
    const v = Number(n.vrNf);
    const cur = map.get(uf);
    if (cur) {
      cur.quantidade += 1;
      cur.valorTotal += v;
    } else {
      map.set(uf, { quantidade: 1, valorTotal: v });
    }
    valorGeral += v;
  }

  const linhas = [...map.entries()]
    .map(([uf, v]) => ({ uf, ...v }))
    .sort((a, b) => b.valorTotal - a.valorTotal || a.uf.localeCompare(b.uf));

  return { linhas, valorGeral };
}

export interface LinhaModalidade {
  modalidade: string;
  quantidade: number;
  valorTotal: number;
}

export interface MaiorPedido {
  numero: string | null;
  participante: string | null;
  valor: number;
}

/**
 * C6 , Modalidades e maior pedido. Agrupa os pedidos do período pela operação
 * (`operacaoNome`, a "modalidade" da venda) somando `vrProdutos`, e identifica o
 * maior pedido do recorte. Pedidos sem operação entram como "Outras".
 */
export async function queryModalidadesEMaiorPedido(
  prisma: PrismaClient,
  filtros: FiltrosVendas,
): Promise<{ modalidades: LinhaModalidade[]; maiorPedido: MaiorPedido | null }> {
  const pedidos = await prisma.fatoPedido.findMany({
    where: {
      ...SO_VENDA_PEDIDO,
      ...buildEmpresaWhere(filtros.empresaId),
      ...periodoWhere(filtros.periodoDe, filtros.periodoAte, "dataOrcamento"),
    },
    select: {
      operacaoNome: true,
      vrProdutos: true,
      numero: true,
      participanteNome: true,
    },
  });

  const map = new Map<string, { quantidade: number; valorTotal: number }>();
  let maiorPedido: MaiorPedido | null = null;
  for (const p of pedidos) {
    const modalidade = p.operacaoNome ?? "Outras";
    const v = Number(p.vrProdutos);
    const cur = map.get(modalidade);
    if (cur) {
      cur.quantidade += 1;
      cur.valorTotal += v;
    } else {
      map.set(modalidade, { quantidade: 1, valorTotal: v });
    }
    if (!maiorPedido || v > maiorPedido.valor) {
      maiorPedido = { numero: p.numero, participante: p.participanteNome, valor: v };
    }
  }

  const modalidades = [...map.entries()]
    .map(([modalidade, v]) => ({ modalidade, ...v }))
    .sort(
      (a, b) =>
        b.valorTotal - a.valorTotal || a.modalidade.localeCompare(b.modalidade),
    );

  return { modalidades, maiorPedido };
}

export interface IndicadoresVendas {
  faturamento: number;
  numPedidos: number;
  ticketMedio: number;
}

/**
 * C2 , Indicadores do período. Faturamento = soma do valor das notas de saída
 * autorizadas (por `dataEmissao`); nº de pedidos = pedidos do período (por
 * `dataOrcamento`); ticket médio = faturamento / nº de pedidos. (Margem fica em
 * seção própria, depende de custo por item , ver fatos-status.)
 */
export async function queryIndicadoresVendas(
  prisma: PrismaClient,
  filtros: FiltrosVendas,
): Promise<IndicadoresVendas> {
  const escopo = filtros.ufs && filtros.ufs.length ? new Set(filtros.ufs) : null;
  const notas = await prisma.fatoNotaFiscal.findMany({
    where: {
      ...SO_VENDA_NOTA,
      ...buildEmpresaWhere(filtros.empresaId),
      ...periodoWhere(filtros.periodoDe, filtros.periodoAte, "dataEmissao"),
    },
    select: { vrNf: true, participanteId: true },
  });

  // UF-scoping: quando o usuário é restrito a UFs, o faturamento também respeita
  // o recorte (via UF do cliente em fato_parceiro), igual ao mapa (queryVendasPorUf).
  let notasEscopo = notas;
  if (escopo) {
    const partIds = [
      ...new Set(notas.map((n) => n.participanteId).filter((x): x is number => x != null)),
    ];
    const parceiros = partIds.length
      ? await prisma.fatoParceiro.findMany({
          where: { odooId: { in: partIds } },
          select: { odooId: true, uf: true },
        })
      : [];
    const ufPorParceiro = new Map(parceiros.map((p) => [p.odooId, siglaDeUf(p.uf) ?? "??"]));
    notasEscopo = notas.filter((n) => {
      const uf = n.participanteId != null ? ufPorParceiro.get(n.participanteId) ?? "??" : "??";
      return escopo.has(uf);
    });
  }
  const faturamento = notasEscopo.reduce((s, n) => s + Number(n.vrNf), 0);

  const numPedidos = await prisma.fatoPedido.count({
    where: {
      ...SO_VENDA_PEDIDO,
      ...buildEmpresaWhere(filtros.empresaId),
      ...periodoWhere(filtros.periodoDe, filtros.periodoAte, "dataOrcamento"),
    },
  });

  const ticketMedio = numPedidos > 0 ? faturamento / numPedidos : 0;
  return { faturamento, numPedidos, ticketMedio };
}

export interface MargemEstimada {
  receita: number;
  custoEstimado: number;
  margem: number;
  margemPct: number;
}

/**
 * Margem ESTIMADA do período (rótulo obrigatório "estimada"). Não há custo por
 * linha no cache, então usa-se o custo de catálogo (`fato_produto.preco_custo`)
 * multiplicado pela quantidade vendida (itens de NF de saída). Aproximação , a
 * margem real exigiria COGS por lote (ver fatos-status).
 */
export async function queryMargemEstimada(
  prisma: PrismaClient,
  filtros: FiltrosVendas,
): Promise<MargemEstimada> {
  const notaIds = await idsNotasVendaExterna(prisma, filtros);
  const itens = notaIds.length
    ? await prisma.fatoNotaFiscalItem.findMany({
        where: { documentoId: { in: notaIds } },
        select: { produtoId: true, vrProdutos: true, quantidade: true },
      })
    : [];

  const produtoIds = [
    ...new Set(itens.map((i) => i.produtoId).filter((x): x is number => x != null)),
  ];
  const produtos = produtoIds.length
    ? await prisma.fatoProduto.findMany({
        where: { odooId: { in: produtoIds } },
        select: { odooId: true, precoCusto: true },
      })
    : [];
  const custoPorProduto = new Map(
    produtos.map((p) => [p.odooId, Number(p.precoCusto ?? 0)]),
  );

  let receita = 0;
  let custoEstimado = 0;
  for (const it of itens) {
    receita += Number(it.vrProdutos);
    const custoUnit = it.produtoId != null ? custoPorProduto.get(it.produtoId) ?? 0 : 0;
    custoEstimado += custoUnit * Number(it.quantidade);
  }
  const margem = receita - custoEstimado;
  const margemPct = receita > 0 ? (margem / receita) * 100 : 0;
  return { receita, custoEstimado, margem, margemPct };
}
