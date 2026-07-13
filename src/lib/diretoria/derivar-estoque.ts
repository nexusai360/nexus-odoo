// Derivação client-side dos agregados de estoque a partir das linhas GRANULARES
// (produto×local). É o que permite filtros globais REAIS e cruzados (família,
// marca, local) no construtor: filtra as linhas e recomputa indicadores, donuts,
// estoque por local e catálogo de forma consistente entre si. Funções puras,
// sem Prisma (rodam no client). Os blocos de compras não dependem destas
// dimensões e ficam intactos.

import { INDICE_ESTOQUE_PADRAO, aplicarIndice } from "@/lib/indice-estoque";
import type { LinhaAgrupada, CatalogoModelo, IndicadoresEstoque, LinhaEstoqueGranular } from "@/lib/diretoria/queries/estoque";

export type { LinhaEstoqueGranular };

export interface FiltrosEstoque {
  familia: string | null;
  marca: string | null;
  local: string | null;
}

export const FILTROS_VAZIOS: FiltrosEstoque = { familia: null, marca: null, local: null };

export function temFiltro(f: FiltrosEstoque): boolean {
  return f.familia != null || f.marca != null || f.local != null;
}

/** Aplica os filtros ativos (AND entre dimensões) às linhas granulares. */
export function filtrarEstoque(linhas: LinhaEstoqueGranular[], f: FiltrosEstoque): LinhaEstoqueGranular[] {
  return linhas.filter(
    (l) =>
      (f.familia == null || l.familia === f.familia) &&
      (f.marca == null || l.marca === f.marca) &&
      (f.local == null || l.local === f.local),
  );
}

/** Opções distintas de cada dimensão (ordenadas), para os dropdowns globais. */
export function opcoesEstoque(linhas: LinhaEstoqueGranular[]): {
  familias: string[];
  marcas: string[];
  locais: string[];
} {
  const fam = new Set<string>();
  const mar = new Set<string>();
  const loc = new Set<string>();
  for (const l of linhas) {
    fam.add(l.familia);
    mar.add(l.marca);
    loc.add(l.local);
  }
  const ord = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return { familias: ord(fam), marcas: ord(mar), locais: ord(loc) };
}

function agrupar(linhas: LinhaEstoqueGranular[], campo: "familia" | "marca" | "local"): { linhas: LinhaAgrupada[]; valorGeral: number } {
  const map = new Map<string, { quantidade: number; valorTotal: number }>();
  let valorGeral = 0;
  for (const l of linhas) {
    const k = l[campo];
    const cur = map.get(k);
    if (cur) { cur.quantidade += l.quantidade; cur.valorTotal += l.valor; }
    else map.set(k, { quantidade: l.quantidade, valorTotal: l.valor });
    valorGeral += l.valor;
  }
  const out = [...map.entries()]
    .map(([chave, v]) => ({ chave, ...v }))
    .sort((a, b) => b.valorTotal - a.valorTotal || a.chave.localeCompare(b.chave));
  return { linhas: out, valorGeral };
}

/**
 * Indicadores a partir das linhas granulares (usado no filtro cruzado do construtor).
 *
 * `indice` e o mesmo que o servidor aplicou no card (Configuracao > Diretoria · Vendas):
 * o KPI "Valor em estoque" e o valor a custo DIVIDIDO por ele. Antes esta derivacao
 * ignorava o indice e devolvia o custo puro, entao o card mudava de valor quando o usuario
 * aplicava um filtro , um numero com filtro, outro sem, para quem nao usa o indice padrao.
 */
export function derivarIndicadores(
  linhas: LinhaEstoqueGranular[],
  indice: number = INDICE_ESTOQUE_PADRAO,
): IndicadoresEstoque {
  let valorTotal = 0;
  let itens = 0;
  const produtos = new Set<string>();
  const locais = new Set<string>();
  for (const l of linhas) {
    valorTotal += l.valor;
    itens += l.quantidade;
    produtos.add(l.produtoId != null ? `id:${l.produtoId}` : `nome:${l.produto}`);
    locais.add(l.local);
  }
  const arred = (v: number) => Math.round(v * 100) / 100;
  return {
    // As linhas ja vem valorizadas A CUSTO; o KPI e esse valor dividido pelo indice vigente,
    // igual ao que o servidor faz em queryIndicadoresEstoque. Passar o indice e o que mantem
    // o card estavel entre "com filtro" e "sem filtro".
    valorTotal: arred(aplicarIndice(valorTotal, indice)),
    valorACusto: arred(valorTotal),
    indice,
    itens,
    produtos: produtos.size,
    locais: locais.size,
    // Esta derivacao ja recebe as linhas valorizadas; o gap de custo e apurado na query.
    produtosSemCusto: 0,
    linhasNegativas: 0,
  };
}

export function derivarCatalogo(linhas: LinhaEstoqueGranular[], limit = 500): { linhas: CatalogoModelo[]; total: number; valorGeral: number } {
  const map = new Map<string, { produto: string; familia: string; marca: string; quantidade: number; valorTotal: number; locais: Set<string> }>();
  let valorGeral = 0;
  for (const l of linhas) {
    const chave = l.produtoId != null ? `id:${l.produtoId}` : `nome:${l.produto}`;
    valorGeral += l.valor;
    const cur = map.get(chave);
    if (cur) { cur.quantidade += l.quantidade; cur.valorTotal += l.valor; cur.locais.add(l.local); }
    else map.set(chave, { produto: l.produto, familia: l.familia, marca: l.marca, quantidade: l.quantidade, valorTotal: l.valor, locais: new Set([l.local]) });
  }
  const todas = [...map.values()]
    .map((v) => ({ produto: v.produto, familia: v.familia, marca: v.marca, quantidade: v.quantidade, valorTotal: v.valorTotal, locais: v.locais.size }))
    .sort((a, b) => b.valorTotal - a.valorTotal || a.produto.localeCompare(b.produto));
  return { linhas: todas.slice(0, limit), total: todas.length, valorGeral };
}

/** Pedaços de estoque recomputados a partir das linhas filtradas. */
export interface EstoqueDerivado {
  indicadores: IndicadoresEstoque;
  porLocal: { linhas: LinhaAgrupada[]; valorGeral: number };
  porFamilia: { linhas: LinhaAgrupada[]; valorGeral: number };
  porMarca: { linhas: LinhaAgrupada[]; valorGeral: number };
  catalogo: { linhas: CatalogoModelo[]; total: number; valorGeral: number };
}

export function derivarEstoque(
  linhas: LinhaEstoqueGranular[],
  f: FiltrosEstoque,
  indice: number = INDICE_ESTOQUE_PADRAO,
): EstoqueDerivado {
  const fl = filtrarEstoque(linhas, f);
  return {
    indicadores: derivarIndicadores(fl, indice),
    porLocal: agrupar(fl, "local"),
    porFamilia: agrupar(fl, "familia"),
    porMarca: agrupar(fl, "marca"),
    catalogo: derivarCatalogo(fl),
  };
}
