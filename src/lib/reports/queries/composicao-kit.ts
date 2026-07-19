// src/lib/reports/queries/composicao-kit.ts
//
// Composição de valor de um kit: dado o kit, resolve a BOM ativa e rateia o valor de referência
// (preço de venda de TABELA do kit por padrão; venda real mediana como visão secundária com n>=5)
// entre os componentes, PROPORCIONAL ao custo. Fonte única das 4 pontas (Diretoria, Relatórios,
// Nex). Honestidade do dado: onde falta preço de componente, o painel mostra o buraco, não inventa
// (coberturaCompleta=false não rateia como %). Fiel à perícia
// docs/superpowers/research/2026-07-19-plan3-pericia-completa-valor-kits.md e ao PLAN 3 v3.

import type { PrismaClient } from "@/generated/prisma/client";
import { resolverBom, type LinhaBom } from "@/lib/estoque/resolver-bom";
import { desmembrarValor, type PesoComponente } from "@/lib/estoque/desmembrar-valor";

/** Tabelas de preço de VENDA no cache (fato_preco.tabela_id). */
const TABELA_VENDA_PADRAO = 3; // "Venda Padrão /0,3"
const TABELA_VENDA_SMART = 5; // "Venda Smart"

/** n mínimo de vendas reais para a mediana virar base (abaixo disso, média/mediana engana). */
const MIN_VENDAS_BASE = 5;

export type BaseValor =
  | "preco_tabela_padrao"
  | "preco_tabela_smart"
  | "venda_real_mediana"
  | "sem_referencia";

export interface ComponenteComposicao {
  componenteId: number;
  nome: string | null;
  quantidade: number;
  precoCusto: number | null;
  precoVendaPadrao: number | null;
  precoVendaSmart: number | null;
  /** true quando a marca do componente é Matrix (badge Matrix x acessório). */
  ehMatrix: boolean;
  /** Rateio do valor de referência atribuído a este componente (em reais). 0 se não ratear. */
  valorRateado: number;
  /** % do kit (invariante à base: depende só dos pesos de custo). 0 quando não rateia. */
  percentual: number;
  /** true quando o componente não tem custo NEM nenhuma referência de venda. */
  semPreco: boolean;
}

export interface ComposicaoKit {
  kitId: number;
  kitNome: string | null;
  unidadeNome: string | null;
  marcaNome: string | null;
  ehMatrix: boolean;
  /** Valor usado para ratear (em reais). Ver baseValor. 0 quando sem_referencia. */
  valorReferencia: number;
  baseValor: BaseValor;
  /** Preço de tabela do kit (para exibir as duas visões lado a lado). */
  precoVendaPadraoKit: number | null;
  precoVendaSmartKit: number | null;
  /** n de vendas reais (vr_produtos>0) do kit e sua mediana (visão secundária). */
  nVendas: number;
  medianaVendaReal: number | null;
  componentes: ComponenteComposicao[];
  multiplasListas: boolean;
  /** false se algum componente não tem custo NEM venda (rateio de % indisponível). */
  coberturaCompleta: boolean;
}

export interface OpcoesComposicaoKit {
  /** "tabela" (padrão) lidera pelo preço de tabela; "venda_real" tenta a mediana (exige n>=5). */
  base?: "tabela" | "venda_real";
}

/** Remove travessões do ERP (em dash U+2014, en dash U+2013), trocando por vírgula. */
const RE_TRAVESSAO = new RegExp(
  `\\s*[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2013)}]\\s*`,
  "g",
);
export function sanitizarTravessao(s: string | null): string | null {
  if (s == null) return null;
  return s.replace(RE_TRAVESSAO, ", ");
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const s = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(s.length / 2);
  return s.length % 2 ? s[meio] : (s[meio - 1] + s[meio]) / 2;
}

/**
 * Monta a composição de valor de um kit. Retorna null se o kit não existe.
 * NÃO faz chamada ao Odoo (lê só o cache). Consome resolverBom (BOM ativa) e desmembrarValor.
 */
export async function queryComposicaoKit(
  prisma: PrismaClient,
  kitId: number,
  opts: OpcoesComposicaoKit = {},
): Promise<ComposicaoKit | null> {
  const kit = await prisma.fatoProduto.findUnique({
    where: { odooId: kitId },
    select: { odooId: true, nome: true, unidadeNome: true, marcaNome: true },
  });
  if (!kit) return null;

  const bomRows = await prisma.fatoListaMaterialItem.findMany({
    where: { produtoPaiId: kitId },
    select: {
      componenteProdutoId: true,
      componenteNome: true,
      quantidade: true,
      listaId: true,
      listaDataAtivacao: true,
      listaInativa: true,
    },
  });
  const linhas: LinhaBom[] = bomRows.map((b) => ({
    componenteProdutoId: b.componenteProdutoId,
    componenteNome: b.componenteNome,
    quantidade: Number(b.quantidade),
    listaId: b.listaId,
    listaDataAtivacao: b.listaDataAtivacao,
    listaInativa: b.listaInativa,
  }));
  const bom = resolverBom(linhas);
  const compIds = bom.componentes.map((c) => c.componenteProdutoId);

  // Custo/venda dos componentes (fato_produto) + tabelas de venda (fato_preco) do kit e componentes.
  const [prods, precos, vendasReais] = await Promise.all([
    compIds.length
      ? prisma.fatoProduto.findMany({
          where: { odooId: { in: compIds } },
          select: { odooId: true, marcaNome: true, precoCusto: true, precoVenda: true },
        })
      : Promise.resolve([]),
    prisma.fatoPreco.findMany({
      where: {
        produtoId: { in: [kitId, ...compIds] },
        tabelaId: { in: [TABELA_VENDA_PADRAO, TABELA_VENDA_SMART] },
      },
      select: { produtoId: true, tabelaId: true, valor: true },
    }),
    prisma.fatoPedidoItem.findMany({
      where: { produtoId: kitId, vrProdutos: { gt: 0 } },
      select: { vrProdutos: true },
    }),
  ]);

  const prodPorId = new Map(prods.map((p) => [p.odooId, p]));
  // Preço de venda por (produtoId, tabelaId). Uma linha por tabela por produto.
  const precoPorProdTab = new Map<string, number | null>();
  for (const p of precos) {
    if (p.produtoId == null) continue;
    precoPorProdTab.set(`${p.produtoId}:${p.tabelaId}`, num(p.valor));
  }
  const tabPadrao = (id: number) => precoPorProdTab.get(`${id}:${TABELA_VENDA_PADRAO}`) ?? null;
  const tabSmart = (id: number) => precoPorProdTab.get(`${id}:${TABELA_VENDA_SMART}`) ?? null;

  // Valor de referência (base). Padrão: tabela; venda_real só entra com n>=5 (mediana).
  const precoVendaPadraoKit = tabPadrao(kitId);
  const precoVendaSmartKit = tabSmart(kitId);
  const vendas = vendasReais.map((v) => Number(v.vrProdutos)).filter((v) => v > 0);
  const nVendas = vendas.length;
  const medianaVendaReal = mediana(vendas);

  let baseValor: BaseValor;
  let valorReferencia: number;
  if (opts.base === "venda_real" && nVendas >= MIN_VENDAS_BASE && medianaVendaReal != null) {
    baseValor = "venda_real_mediana";
    valorReferencia = medianaVendaReal;
  } else if (precoVendaPadraoKit != null) {
    baseValor = "preco_tabela_padrao";
    valorReferencia = precoVendaPadraoKit;
  } else if (precoVendaSmartKit != null) {
    baseValor = "preco_tabela_smart";
    valorReferencia = precoVendaSmartKit;
  } else if (nVendas >= MIN_VENDAS_BASE && medianaVendaReal != null) {
    baseValor = "venda_real_mediana";
    valorReferencia = medianaVendaReal;
  } else {
    baseValor = "sem_referencia";
    valorReferencia = 0;
  }

  // Monta os componentes com preços. Peso do rateio = quantidade x custo (fallback venda de tabela
  // -> preço de venda do produto). semPreco quando não há custo NEM nenhuma referência de venda.
  const parciais = bom.componentes.map((c) => {
    const prod = prodPorId.get(c.componenteProdutoId);
    const precoCusto = prod ? num(prod.precoCusto) : null;
    const precoVendaProd = prod ? num(prod.precoVenda) : null;
    const precoVendaPadrao = tabPadrao(c.componenteProdutoId);
    const precoVendaSmart = tabSmart(c.componenteProdutoId);
    const pesoUnit = precoCusto ?? precoVendaPadrao ?? precoVendaSmart ?? precoVendaProd;
    const semPreco = pesoUnit == null;
    return {
      componenteId: c.componenteProdutoId,
      nome: sanitizarTravessao(c.componenteNome),
      quantidade: c.quantidade,
      precoCusto,
      precoVendaPadrao,
      precoVendaSmart,
      ehMatrix: /matrix/i.test(prod?.marcaNome ?? ""),
      semPreco,
      peso: semPreco ? 0 : c.quantidade * (pesoUnit as number),
    };
  });

  const coberturaCompleta = parciais.every((p) => !p.semPreco);
  const podeRatear = coberturaCompleta && valorReferencia > 0;

  // Rateio só quando a cobertura é completa: senão os precificados absorveriam 100% (enganoso).
  const pesos: PesoComponente[] = parciais.map((p) => ({ componenteId: p.componenteId, peso: p.peso }));
  const somaPesos = pesos.reduce((s, p) => s + p.peso, 0);
  const rateado = podeRatear
    ? new Map(
        desmembrarValor(Math.round(valorReferencia * 100), pesos).map((v) => [v.componenteId, v.valor]),
      )
    : new Map<number, number>();

  const componentes: ComponenteComposicao[] = parciais.map((p) => ({
    componenteId: p.componenteId,
    nome: p.nome,
    quantidade: p.quantidade,
    precoCusto: p.precoCusto,
    precoVendaPadrao: p.precoVendaPadrao,
    precoVendaSmart: p.precoVendaSmart,
    ehMatrix: p.ehMatrix,
    valorRateado: podeRatear ? (rateado.get(p.componenteId) ?? 0) / 100 : 0,
    percentual: podeRatear && somaPesos > 0 ? Math.round((p.peso / somaPesos) * 1000) / 10 : 0,
    semPreco: p.semPreco,
  }));

  return {
    kitId,
    kitNome: sanitizarTravessao(kit.nome),
    unidadeNome: sanitizarTravessao(kit.unidadeNome),
    marcaNome: sanitizarTravessao(kit.marcaNome),
    ehMatrix: /matrix/i.test(kit.marcaNome ?? ""),
    valorReferencia,
    baseValor,
    precoVendaPadraoKit,
    precoVendaSmartKit,
    nVendas,
    medianaVendaReal,
    componentes,
    multiplasListas: bom.multiplasListas,
    coberturaCompleta,
  };
}
