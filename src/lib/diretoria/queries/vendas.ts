// Queries de Vendas da Diretoria (módulo C do HTML). Próprias da Diretoria para
// não tocar os arquivos compartilhados de relatórios. Padrão do projeto:
// recebem (prisma, filtros), agregam em memória, retornam linhas ordenadas.

import type { PrismaClient } from "@/generated/prisma/client";

import { siglaDeUf } from "@/lib/diretoria/uf";

export interface FiltrosVendas {
  periodoDe?: string;
  periodoAte?: string;
  /** Recorte geográfico (UF-scoping); vazio/undefined = todas as UFs. */
  ufs?: string[];
}

function periodoWhere(
  de: string | undefined,
  ate: string | undefined,
  campo: string,
): Record<string, unknown> {
  if (!de || !ate) return {};
  return {
    [campo]: {
      gte: new Date(`${de}T00:00:00Z`),
      lte: new Date(`${ate}T23:59:59Z`),
    },
  };
}

export interface LinhaFormaPagamento {
  formaPagamento: string;
  quantidade: number;
  valorTotal: number;
}

/**
 * C10 , Formas de pagamento no período. Agrega o valor das parcelas por forma de
 * pagamento (`formaPagamentoNome`), filtrando por `dataVencimento`. Parcelas sem
 * forma definida entram como "Não informado".
 */
export async function queryFormasPagamento(
  prisma: PrismaClient,
  filtros: FiltrosVendas,
): Promise<{ linhas: LinhaFormaPagamento[]; valorGeral: number }> {
  const rows = await prisma.fatoPedidoParcela.findMany({
    where: periodoWhere(filtros.periodoDe, filtros.periodoAte, "dataVencimento"),
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
  const itens = await prisma.fatoNotaFiscalItem.findMany({
    where: {
      entradaSaida: "1",
      ...periodoWhere(filtros.periodoDe, filtros.periodoAte, "dataEmissao"),
    },
    select: { produtoId: true, vrProdutos: true },
  });

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
      entradaSaida: "1",
      situacaoNfe: "autorizada",
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
    where: periodoWhere(filtros.periodoDe, filtros.periodoAte, "dataOrcamento"),
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
  const notas = await prisma.fatoNotaFiscal.findMany({
    where: {
      entradaSaida: "1",
      situacaoNfe: "autorizada",
      ...periodoWhere(filtros.periodoDe, filtros.periodoAte, "dataEmissao"),
    },
    select: { vrNf: true },
  });
  const faturamento = notas.reduce((s, n) => s + Number(n.vrNf), 0);

  const numPedidos = await prisma.fatoPedido.count({
    where: periodoWhere(filtros.periodoDe, filtros.periodoAte, "dataOrcamento"),
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
  const itens = await prisma.fatoNotaFiscalItem.findMany({
    where: {
      entradaSaida: "1",
      ...periodoWhere(filtros.periodoDe, filtros.periodoAte, "dataEmissao"),
    },
    select: { produtoId: true, vrProdutos: true, quantidade: true },
  });

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
