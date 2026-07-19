// src/lib/reports/queries/estoque.ts
//
// Núcleo de agregação de estoque, framework-neutro. Cada função recebe `prisma`
// + filtros e devolve dado de agregação cru , **sem `estado`, sem `freshness`,
// sem shaping de gráfico**. **Não captura exceção** (deixa propagar , quem
// trata é o wrapper). `estadoDoFato`/`reportFreshness` vivem no wrapper
// `report-data.ts`, não aqui.
//
// O módulo **importa** `limparNomeLocal` de `@/lib/reports/local-nome` e a usa
// nas agregações que precisam de rótulo de local , `limparNomeLocal` permanece
// em seu módulo atual, não é movida. O que **não vai** para o núcleo:
// `agruparTopN` (report-data.ts, função local) e as constantes `TOP_N`/
// `TOP_CONCENTRACAO` , são shaping de gráfico e permanecem no wrapper.

import type { PrismaClient } from "@/generated/prisma/client";
import {
  avisoCorte,
  clampIsoAoCorte,
  clampMesAoCorte,
  corteAtual,
  corteAtualDate,
  pedeAntesDoCorte,
} from "@/lib/corte-dados";
import { limparNomeLocal } from "@/lib/reports/local-nome";
import {
  whereLocalDoEscopo,
  type EscopoLocal,
} from "@/lib/estoque/locais-por-classificacao";
// tsconfig raiz usa moduleResolution:"bundler" (Next/Turbopack), mcp/tsconfig
// usa "nodenext". Em runtime ambos resolvem este caminho corretamente; sem
// extensao para o Turbopack aceitar. O tsc do MCP reclama na compilacao mas
// nao impacta runtime (transpilacao via tsx ignora). @ts-expect-error usado
// somente no tsc do MCP via build script (ver mcp/Dockerfile).
import { searchProductByNameWithMetaCanonical } from "./_search-helpers";

// ---------------------------------------------------------------------------
// Data de inicio das analises (AppSetting sync.corte_dados) neste modulo
//
// SALDO, valor por armazem, concentracao e produtos parados sao FOTO do estoque de HOJE
// (fato_estoque_saldo / fato_produto_parado): nao tem eixo de tempo, entao o piso do corte
// NAO se aplica , filtrar por data ali esconderia o estoque que existe agora.
//
// MOVIMENTO (fato_estoque_movimento) e HISTORICO (documento com data): entradas/saidas,
// top movimentados e a reconstrucao do comparativo TEM que respeitar o piso.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Classificacao de local (fisico | demonstracao | todos)
//
// A arvore de locais do Odoo tem tres raizes e so a "Proprio" e estoque da casa. Quem
// consulta escolhe o escopo; aqui o padrao e "todos" (a arvore inteira) porque este
// nucleo tambem serve os relatorios antigos, que nasceram sem esse recorte. As tools do
// agente Nex passam "fisico" por padrao, para falar o mesmo numero que a diretoria.
// ---------------------------------------------------------------------------

/** Where de periodo do fato de movimento, ja grampeado a data de inicio das analises. */
interface JanelaMovimento {
  mes: { gte: string; lte?: string };
  data: { gte: Date; lt?: Date };
}

/**
 * Janela de leitura do movimento de estoque, em duas camadas complementares:
 *
 *   - `mes` (AAAA-MM, o eixo da serie): grampeado ao mes do corte via clampMesAoCorte;
 *   - `data` (coluna real do fato): piso EXATO no corte. E o que impede o balde do mes do
 *     corte de arrastar os dias anteriores a ele (com corte em 16/03, o mes "2026-03" nao
 *     pode somar os movimentos de 01 a 15/03).
 *
 * Sem periodo, o piso e o proprio corte: a consulta nunca varre o historico inteiro.
 * Aceita o periodo em AAAA-MM (tela de relatorios) ou AAAA-MM-DD (agente / construtor).
 */
function janelaMovimento(periodoDe?: string, periodoAte?: string): JanelaMovimento {
  const corte = corteAtual();
  const mesDe = clampMesAoCorte((periodoDe ?? corte).slice(0, 7));
  const mesAte = periodoAte?.slice(0, 7);

  // Inicio efetivo em dia: usa o dia pedido quando ele veio; senao, o 1o dia do mes ja
  // clampado. Em ambos os casos passa pelo clamp final (nada antes do corte).
  const inicioPedido =
    periodoDe && periodoDe.length >= 10 ? periodoDe.slice(0, 10) : `${mesDe}-01`;
  const gte = new Date(`${clampIsoAoCorte(inicioPedido)}T00:00:00Z`);

  // Borda superior EXCLUSIVA: dia seguinte ao "ate" (ou 1o dia do mes seguinte ao "ate"),
  // para o ultimo dia/mes entrar inteiro.
  let lt: Date | undefined;
  if (periodoAte && periodoAte.length >= 10) {
    lt = new Date(`${periodoAte.slice(0, 10)}T00:00:00Z`);
    lt.setUTCDate(lt.getUTCDate() + 1);
  } else if (mesAte) {
    lt = new Date(`${mesAte}-01T00:00:00Z`);
    lt.setUTCMonth(lt.getUTCMonth() + 1);
  }

  return {
    mes: { gte: mesDe, ...(mesAte ? { lte: mesAte } : {}) },
    data: { gte, ...(lt ? { lt } : {}) },
  };
}

// ---------------------------------------------------------------------------
// Tipos de R1 , Saldo por produto
// ---------------------------------------------------------------------------

/** Item do detalhamento por local de um produto (para o drill-down). */
export interface DetalhePorLocal {
  localRotulo: string;
  saldo: number;
  valor: number;
}

/** Linha agregada de R1 (por produto). */
export interface SaldoProdutoRow {
  produtoNome: string;
  familiaNome: string | null;
  marcaNome: string | null;
  saldoTotal: number;
  valorTotal: number;
  numLocais: number;
  /** Saldo do produto quebrado por local, com rótulo limpo. */
  detalhePorLocal: DetalhePorLocal[];
  /** true quando produto existe no cadastro (fato_produto) mas nao tem linha
   *  de saldo (fato_estoque_saldo). Distinto de "saldo zero com linha". */
  semEstoqueCadastrado?: boolean;
  /** Microcopy para o agente respeitar quando produto sem linha. */
  mensagemContexto?: string;
}

/** KPIs de topo de R1. */
export interface SaldoProdutoKpis {
  totalProdutos: number;
  produtosNegativos: number;
  valorTotal: number;
}

/** Retorno completo de R1. */
export interface SaldoProdutoData {
  kpis: SaldoProdutoKpis;
  linhas: SaldoProdutoRow[];
  /** Meta da busca por termo (so presente quando filtros.termo foi informado).
   *  Usada pelo handler MCP para preencher o campo `ambiguidade` no output e
   *  guiar o agente a perguntar de volta quando ha multiplos candidatos. */
  buscaMeta?: { totalMatches: number; layer: "exact" | "fuzzy" | "none" };
}

// ---------------------------------------------------------------------------
// R1 , querySaldoProduto
// ---------------------------------------------------------------------------

/**
 * Agrega saldo de estoque por produto.
 * Fato: fato_estoque_saldo.
 * Corte NAO se aplica: saldo e FOTO do estoque de hoje (sem eixo de tempo). Filtrar por
 * data aqui esconderia mercadoria que esta fisicamente no armazem agora.
 * Não captura exceção , deixa propagar para o wrapper.
 */
export async function querySaldoProduto(
  prisma: PrismaClient,
  filtros: {
    armazemId?: number;
    familiaId?: number;
    termo?: string;
    /** Escopo da arvore de locais. Sem valor, a arvore inteira (compatibilidade). */
    classificacao?: EscopoLocal;
  },
): Promise<SaldoProdutoData> {
  // Busca tolerante a acento: quando vier `termo`, usa helper SQL com unaccent
  // + fallback pg_trgm e filtra os fatos pelos produtoIds retornados, em vez
  // de depender do ILIKE case-insensitive do Prisma (que nao tira acento).
  // Onda B do Renascimento: tambem captura totalMatches/layer para o handler
  // MCP preencher o campo opcional `ambiguidade` quando ha multiplos candidatos.
  let produtoIdsFiltro: number[] | undefined;
  let buscaMeta:
    | { totalMatches: number; layer: "exact" | "fuzzy" | "none" }
    | undefined;
  if (filtros.termo) {
    // Usa o helper canonical contra fato_produto (catalogo completo, nao
    // limitado a produtos com saldo). Import estatico no topo do arquivo.
    const r = await searchProductByNameWithMetaCanonical(prisma, filtros.termo);
    produtoIdsFiltro = r.ids;
    buscaMeta = { totalMatches: r.totalMatches, layer: r.layer === "codigo" ? "exact" : r.layer };
    if (produtoIdsFiltro && produtoIdsFiltro.length === 0) {
      return {
        kpis: { totalProdutos: 0, produtosNegativos: 0, valorTotal: 0 },
        linhas: [],
        buscaMeta,
      };
    }
  }

  // Escopo da arvore de locais. Um armazem pedido explicitamente manda: quem pergunta
  // "o saldo no armazem X" quer o X, seja ele qual for na arvore.
  const escopo = filtros.armazemId
    ? {}
    : await whereLocalDoEscopo(prisma, filtros.classificacao ?? "todos");

  // groupBy não suporta _count(distinct), então buscamos os dados brutos e
  // agregamos em JS , dataset cabe confortavelmente em memória.
  const rows = await prisma.fatoEstoqueSaldo.findMany({
    where: {
      ...(filtros.armazemId ? { localId: filtros.armazemId } : escopo),
      ...(filtros.familiaId ? { familiaId: filtros.familiaId } : {}),
      ...(produtoIdsFiltro ? { produtoId: { in: produtoIdsFiltro } } : {}),
    },
    select: {
      produtoId: true,
      produtoNome: true,
      familiaNome: true,
      marcaNome: true,
      localId: true,
      localNome: true,
      quantidade: true,
      vrSaldo: true,
    },
  });

  // Agrega por produtoId
  const mapa = new Map<
    number,
    {
      produtoNome: string;
      familiaNome: string | null;
      marcaNome: string | null;
      saldoTotal: number;
      valorTotal: number;
      locais: Set<number>;
      detalheMap: Map<string, { saldo: number; valor: number }>;
    }
  >();

  for (const r of rows) {
    // Ignora linhas sem produtoId (dados incompletos do Odoo)
    if (r.produtoId == null) continue;
    const pid = r.produtoId;
    const qty = r.quantidade ? Number(r.quantidade) : 0;
    const vr = r.vrSaldo ? Number(r.vrSaldo) : 0;
    const rotulo = r.localNome
      ? limparNomeLocal(r.localNome).rotulo
      : "Sem local";

    const existing = mapa.get(pid);
    if (existing) {
      existing.saldoTotal += qty;
      existing.valorTotal += vr;
      if (r.localId != null) existing.locais.add(r.localId);
      const prev = existing.detalheMap.get(rotulo) ?? { saldo: 0, valor: 0 };
      existing.detalheMap.set(rotulo, {
        saldo: prev.saldo + qty,
        valor: prev.valor + vr,
      });
    } else {
      const detalheMap = new Map<string, { saldo: number; valor: number }>();
      detalheMap.set(rotulo, { saldo: qty, valor: vr });
      mapa.set(pid, {
        produtoNome: r.produtoNome ?? "",
        familiaNome: r.familiaNome,
        marcaNome: r.marcaNome,
        saldoTotal: qty,
        valorTotal: vr,
        locais: r.localId != null ? new Set([r.localId]) : new Set(),
        detalheMap,
      });
    }
  }

  const linhas: SaldoProdutoRow[] = [...mapa.values()]
    .map((v) => ({
      produtoNome: v.produtoNome,
      familiaNome: v.familiaNome,
      marcaNome: v.marcaNome,
      saldoTotal: v.saldoTotal,
      valorTotal: v.valorTotal,
      numLocais: v.locais.size,
      detalhePorLocal: [...v.detalheMap.entries()]
        .map(([localRotulo, d]) => ({
          localRotulo,
          saldo: d.saldo,
          valor: d.valor,
        }))
        .sort((a, b) => b.valor - a.valor),
    }))
    .sort((a, b) => b.valorTotal - a.valorTotal);

  // Mescla: produtos do filtro que NAO apareceram em fato_estoque_saldo
  // (cadastrados mas sem linha de saldo). Carrega metadado de fato_produto.
  if (produtoIdsFiltro && produtoIdsFiltro.length > 0) {
    const idsComSaldo = new Set(mapa.keys());
    const idsSemSaldo = produtoIdsFiltro.filter((id) => !idsComSaldo.has(id));
    if (idsSemSaldo.length > 0) {
      const metas = await prisma.fatoProduto.findMany({
        where: { odooId: { in: idsSemSaldo } },
        select: { odooId: true, nome: true, familiaNome: true, marcaNome: true },
      });
      for (const m of metas) {
        linhas.push({
          produtoNome: m.nome,
          familiaNome: m.familiaNome,
          marcaNome: m.marcaNome,
          saldoTotal: 0,
          valorTotal: 0,
          numLocais: 0,
          detalhePorLocal: [],
          semEstoqueCadastrado: true,
          mensagemContexto: "produto cadastrado, sem linha de saldo",
        });
      }
      linhas.sort((a, b) => {
        if (b.valorTotal !== a.valorTotal) return b.valorTotal - a.valorTotal;
        return a.produtoNome.localeCompare(b.produtoNome, "pt-BR");
      });
    }
  }

  const totalProdutos = linhas.length;
  const produtosNegativos = linhas.filter((l) => l.saldoTotal < 0).length;
  const valorTotal = linhas.reduce((acc, l) => acc + l.valorTotal, 0);

  return {
    kpis: { totalProdutos, produtosNegativos, valorTotal },
    linhas,
    buscaMeta,
  };
}

// ---------------------------------------------------------------------------
// Tipos de R2 , Valor por armazém
// ---------------------------------------------------------------------------

/** Linha da tabela de R2 (sem percentual , calculado no wrapper/tool). */
export interface ValorArmazemRow {
  [k: string]: unknown;
  armazem: string;
  valor: number;
  numProdutos: number;
  percentual: number;
}

/** KPIs de R2. */
export interface ValorArmazemKpis {
  valorTotal: number;
  numArmazens: number;
}

/** Retorno completo de R2. */
export interface ValorArmazemData {
  kpis: ValorArmazemKpis;
  linhas: ValorArmazemRow[];
  /** Top-8 para o BarChart auxiliar. */
  top8: { rotulo: string; valor: number }[];
}

// ---------------------------------------------------------------------------
// R2 , queryValorArmazem
// ---------------------------------------------------------------------------

/**
 * Agrega valor de estoque por armazém. Devolve linhasBruto (sem percentual ,
 * percentual é shaping e calculado no wrapper F3 e na tool MCP, regra N8).
 * Fato: fato_estoque_saldo. Corte NAO se aplica (foto do saldo de hoje).
 */
export async function queryValorArmazem(
  prisma: PrismaClient,
  // Cobertura Cliente A6: filtro pela ARVORE de locais (raw_estoque_local.
  // data->>'nome_completo', match por PREFIXO , o localNome do fato e rotulo
  // limpo, sem hierarquia). Ex.: ["Próprio"] = so estoque fisico;
  // ["Terceiros / Demonstração"] = equipamentos em demonstracao.
  filtro?: {
    prefixosArvore?: string[];
    /** Escopo da arvore de locais. Ignorado quando vem `prefixosArvore`. */
    classificacao?: EscopoLocal;
  },
): Promise<{ kpis: { valorTotal: number; numArmazens: number }; linhasBruto: { armazem: string; valor: number; numProdutos: number }[] }> {
  let localIds: number[] | undefined;
  const prefixos = (filtro?.prefixosArvore ?? []).filter((p) => p.trim().length > 1);
  if (prefixos.length > 0) {
    const conds = prefixos.map((_, i) => `data->>'nome_completo' ILIKE $${i + 1}`).join(" OR ");
    // raw_deleted = false: nao considerar locais soft-deletados (ex.: o id 414, criado e
    // removido no Odoo). Parenteses ao redor do OR sao obrigatorios: sem eles, a precedencia
    // "A OR B AND raw_deleted=false" deixaria passar um deletado que casa o 1o prefixo.
    const ids = await prisma.$queryRawUnsafe<{ odoo_id: number }[]>(
      `SELECT odoo_id FROM raw_estoque_local WHERE (${conds}) AND raw_deleted = false`,
      ...prefixos.map((p) => `${p}%`),
    );
    localIds = ids.map((r) => r.odoo_id);
    if (localIds.length === 0) {
      return { kpis: { valorTotal: 0, numArmazens: 0 }, linhasBruto: [] };
    }
  }

  // Pedir um ramo da arvore pelo nome ("Terceiros / Demonstração") e pedir uma
  // classificacao sao duas formas de dizer a mesma coisa. Se as duas viessem juntas, a
  // intersecao poderia dar zero sem ninguem entender por que; entao o ramo explicito
  // manda, e a classificacao vale para a consulta sem ramo.
  const escopo =
    localIds !== undefined
      ? {}
      : await whereLocalDoEscopo(prisma, filtro?.classificacao ?? "todos");

  const rows = await prisma.fatoEstoqueSaldo.findMany({
    where: {
      vrSaldo: { gt: 0 },
      ...(localIds ? { localId: { in: localIds } } : escopo),
    },
    select: { localNome: true, produtoId: true, vrSaldo: true },
  });

  const mapa = new Map<string, { valor: number; produtos: Set<number | null> }>();
  for (const r of rows) {
    const nomeRaw = r.localNome ?? "Sem armazém";
    const rotulo = limparNomeLocal(nomeRaw).rotulo;
    const vr = r.vrSaldo ? Number(r.vrSaldo) : 0;
    const existing = mapa.get(rotulo);
    if (existing) {
      existing.valor += vr;
      existing.produtos.add(r.produtoId);
    } else {
      mapa.set(rotulo, { valor: vr, produtos: new Set([r.produtoId]) });
    }
  }

  const valorTotal = [...mapa.values()].reduce((acc, v) => acc + v.valor, 0);

  const linhasBruto = [...mapa.entries()]
    .map(([armazem, v]) => ({ armazem, valor: v.valor, numProdutos: v.produtos.size }))
    .sort((a, b) => b.valor - a.valor);

  return {
    kpis: { valorTotal, numArmazens: mapa.size },
    linhasBruto,
  };
}

// ---------------------------------------------------------------------------
// Tipos de R3 , Entradas e saídas
// ---------------------------------------------------------------------------

/** Ponto da série de R3. */
export interface MovimentoMes {
  mes: string;
  entrada: number;
  saida: number;
}

/** Linha do detalhamento de R3 (por mês × sentido × produto). */
export interface DetalheMovimento {
  [k: string]: unknown;
  mes: string;
  sentido: string;
  produto: string;
  quantidade: number;
}

/** Retorno completo de R3: série do gráfico + tabela de detalhe. */
export interface EntradasSaidasData {
  serie: MovimentoMes[];
  detalhe: DetalheMovimento[];
}

// ---------------------------------------------------------------------------
// R3 , queryEntradasSaidas
// ---------------------------------------------------------------------------

/**
 * Agrega entradas e saídas por mês. Fato: fato_estoque_movimento (HISTORICO).
 * A janela e sempre grampeada a data de inicio das analises (ver janelaMovimento).
 */
export async function queryEntradasSaidas(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string; armazemId?: number },
): Promise<EntradasSaidasData> {
  const j = janelaMovimento(filtros.periodoDe, filtros.periodoAte);
  const where = {
    mes: j.mes,
    data: j.data,
    ...(filtros.armazemId ? { localId: filtros.armazemId } : {}),
  };

  // Série agregada por mês × sentido (para o LineChart).
  const grupos = await prisma.fatoEstoqueMovimento.groupBy({
    by: ["mes", "sentido"],
    where,
    _sum: { quantidade: true },
  });
  const porMes = new Map<string, MovimentoMes>();
  for (const g of grupos) {
    const item = porMes.get(g.mes) ?? { mes: g.mes, entrada: 0, saida: 0 };
    const valor = g._sum.quantidade ? Math.abs(Number(g._sum.quantidade)) : 0;
    if (g.sentido === "entrada") item.entrada = valor;
    else item.saida = valor;
    porMes.set(g.mes, item);
  }
  const serie = [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes));

  // Detalhe por mês × sentido × produto (para a DataTable).
  const detGrupos = await prisma.fatoEstoqueMovimento.groupBy({
    by: ["mes", "sentido", "produtoNome"],
    where,
    _sum: { quantidade: true },
    orderBy: [{ mes: "asc" }, { sentido: "asc" }],
  });
  const detalhe: DetalheMovimento[] = detGrupos.map((g) => ({
    mes: g.mes,
    sentido: g.sentido,
    produto: g.produtoNome ?? "Sem produto",
    quantidade: g._sum.quantidade ? Math.abs(Number(g._sum.quantidade)) : 0,
  }));

  return { serie, detalhe };
}

// ---------------------------------------------------------------------------
// Tipos de R4 , Produtos parados
// ---------------------------------------------------------------------------

/** Linha de R4. */
export interface ProdutoParadoRow {
  [k: string]: unknown;
  produtoNome: string | null;
  localNome: string | null;
  saldo: number;
  dias: number;
  vrSaldo: number;
}
/** KPIs de topo de R4. */
export interface ProdutoParadoKpis {
  totalParados: number;
  valorImobilizado: number;
}
/** Dados de R4: KPIs + tabela. */
export interface ProdutoParadoData {
  kpis: ProdutoParadoKpis;
  total: number;
  linhas: ProdutoParadoRow[];
}

/** Filtros de R4, com paginacao opcional (limit/offset) para a tool MCP. */
export interface ProdutoParadoFiltros {
  faixaDias?: number;
  armazemId?: number;
  /** Tamanho da pagina; quando ausente, retorna todas as linhas (uso F3). */
  limit?: number;
  /** Deslocamento da pagina (alavanca 2b). */
  offset?: number;
}

// ---------------------------------------------------------------------------
// R4 , queryProdutosParados
// ---------------------------------------------------------------------------

/**
 * Lista produtos parados com filtros de faixa de dias e armazém.
 * Fato: fato_produto_parado.
 * Corte NAO se aplica: e a foto do saldo de HOJE com o tempo de imobilizacao (derivado de
 * raw_estoque_saldo_hoje). Nao ha documento historico sendo lido , so o estoque atual.
 */
export async function queryProdutosParados(
  prisma: PrismaClient,
  filtros: ProdutoParadoFiltros,
): Promise<ProdutoParadoData> {
  const where = {
    saldo: { gt: 0 },
    ...(filtros.faixaDias ? { dias: { gte: filtros.faixaDias } } : {}),
    ...(filtros.armazemId ? { localId: filtros.armazemId } : {}),
  };

  // Paginacao opcional (alavanca 2b): quando limit/offset chegam (tool MCP),
  // a pagina de linhas vem limitada por take/skip e os KPIs (totalParados,
  // valorImobilizado) sao calculados sobre o conjunto completo via count +
  // aggregate. Sem limit (uso do dashboard F3), retorna todas as linhas e os
  // KPIs derivam direto da lista.
  const paginando = filtros.limit != null;

  const rows = await prisma.fatoProdutoParado.findMany({
    where,
    select: {
      produtoNome: true,
      localNome: true,
      saldo: true,
      dias: true,
      vrSaldo: true,
      saldoHojeId: true,
    },
    // Ordenacao estavel + desempate por saldoHojeId (PK): "os proximos" nao
    // repetem nem pulam linha entre paginas.
    orderBy: [{ dias: "desc" }, { saldoHojeId: "asc" }],
    ...(paginando ? { take: filtros.limit, skip: filtros.offset ?? 0 } : {}),
  });
  const linhas: ProdutoParadoRow[] = rows.map((r) => ({
    produtoNome: r.produtoNome,
    localNome: r.localNome,
    saldo: Number(r.saldo),
    dias: r.dias,
    vrSaldo: Number(r.vrSaldo),
  }));

  if (!paginando) {
    const valorImobilizado = linhas.reduce((acc, l) => acc + l.vrSaldo, 0);
    return {
      kpis: { totalParados: linhas.length, valorImobilizado },
      total: linhas.length,
      linhas,
    };
  }

  // KPIs sobre o conjunto completo (independente da pagina).
  const [totalParados, agg] = await Promise.all([
    prisma.fatoProdutoParado.count({ where }),
    prisma.fatoProdutoParado.aggregate({ where, _sum: { vrSaldo: true } }),
  ]);
  return {
    kpis: {
      totalParados,
      valorImobilizado: Number(agg._sum.vrSaldo ?? 0),
    },
    total: totalParados,
    linhas,
  };
}

// ---------------------------------------------------------------------------
// Tipos de R5 , Top movimentados
// ---------------------------------------------------------------------------

/** Barra de R5. */
export interface TopMovimentadoBar {
  [k: string]: unknown;
  rotulo: string;
  valor: number;
}
/** KPIs de topo de R5. */
export interface TopMovimentadoKpis {
  totalProdutos: number;
  totalUnidades: number;
}
/** Dados de R5: KPIs + linhas (lista completa , slice para barras feito no wrapper). */
export interface TopMovimentadoData {
  kpis: TopMovimentadoKpis;
  barras: TopMovimentadoBar[];
  linhas: TopMovimentadoBar[];
}

// ---------------------------------------------------------------------------
// R5 , queryTopMovimentados
// ---------------------------------------------------------------------------

/**
 * Agrega movimentações por produto. Devolve a lista completa (sem slice para top-N
 * , o wrapper F3 e a tool MCP fazem o slice independentemente).
 * Fato: fato_estoque_movimento (HISTORICO) , janela grampeada ao corte, mesmo quando o
 * chamador nao manda periodo (o produtor do construtor so manda `sentido`).
 */
export async function queryTopMovimentados(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string; sentido?: string },
): Promise<{ kpis: { totalProdutos: number; totalUnidades: number }; linhas: { rotulo: string; valor: number }[] }> {
  const j = janelaMovimento(filtros.periodoDe, filtros.periodoAte);
  const grupos = await prisma.fatoEstoqueMovimento.groupBy({
    by: ["produtoNome"],
    where: {
      mes: j.mes,
      data: j.data,
      ...(filtros.sentido ? { sentido: filtros.sentido } : {}),
    },
    _sum: { quantidade: true },
  });
  const linhas = grupos
    .map((g) => ({
      rotulo: g.produtoNome ?? "Sem produto",
      valor: g._sum.quantidade ? Math.abs(Number(g._sum.quantidade)) : 0,
    }))
    // Onda 5: desempate estavel por rotulo (produtos com mesma movimentacao).
    .sort((a, b) => b.valor - a.valor || a.rotulo.localeCompare(b.rotulo));

  const totalUnidades = linhas.reduce((acc, l) => acc + l.valor, 0);

  return {
    kpis: { totalProdutos: linhas.length, totalUnidades },
    linhas,
  };
}

// ---------------------------------------------------------------------------
// Tipos de R6 , Concentração
// ---------------------------------------------------------------------------

/** Linha da tabela de famílias de R6. */
export interface ConcentracaoFamiliaRow {
  [k: string]: unknown;
  familia: string;
  valor: number;
  percentual: number;
}

/** Linha da tabela de marcas de R6. */
export interface ConcentracaoMarcaRow {
  [k: string]: unknown;
  marca: string;
  valor: number;
  percentual: number;
}

/** Dados de R6: distribuição por família e por marca. */
export interface ConcentracaoData {
  /** Fatia para o PieChart (família). */
  familia: { rotulo: string; valor: number }[];
  /** Tabela de família com percentual. */
  tabelaFamilia: ConcentracaoFamiliaRow[];
  /** Fatia para o BarChart (marca). */
  marca: { rotulo: string; valor: number }[];
  /** Tabela de marca com percentual. */
  tabelaMarca: ConcentracaoMarcaRow[];
}

// ---------------------------------------------------------------------------
// R6 , queryConcentracao
// ---------------------------------------------------------------------------

/**
 * Agrega vrSaldo por família e marca. Devolve dados brutos (sem percentual ,
 * percentual é shaping calculado no wrapper F3 e na tool MCP, regra N8).
 * Sem agruparTopN , shaping de gráfico fica no wrapper.
 * Fato: fato_estoque_saldo. Corte NAO se aplica (foto do saldo de hoje).
 */
export async function queryConcentracao(
  prisma: PrismaClient,
  filtros: { classificacao?: EscopoLocal } = {},
): Promise<{ familiasBruto: { rotulo: string; valor: number }[]; marcasBruto: { rotulo: string; valor: number }[] }> {
  const escopo = await whereLocalDoEscopo(prisma, filtros.classificacao ?? "todos");
  const where = { vrSaldo: { gt: 0 }, ...escopo };

  const porFamilia = await prisma.fatoEstoqueSaldo.groupBy({
    by: ["familiaNome"],
    where,
    _sum: { vrSaldo: true },
  });
  const porMarca = await prisma.fatoEstoqueSaldo.groupBy({
    by: ["marcaNome"],
    where,
    _sum: { vrSaldo: true },
  });

  const familiasBruto = porFamilia
    .map((g) => ({
      rotulo: g.familiaNome ?? "Não classificado",
      valor: g._sum.vrSaldo ? Number(g._sum.vrSaldo) : 0,
    }))
    .sort((a, b) => b.valor - a.valor);

  const marcasBruto = porMarca
    .map((g) => ({
      rotulo: g.marcaNome ?? "Não classificado",
      valor: g._sum.vrSaldo ? Number(g._sum.vrSaldo) : 0,
    }))
    .sort((a, b) => b.valor - a.valor);

  return { familiasBruto, marcasBruto };
}

/* ────────────────────────────────────────────────────────────────────────────
 * COMPARATIVO DE ESTOQUE ENTRE DATAS (série histórica de snapshots).
 * Precisão: as somas são feitas no SQL por data_ref (nunca mistura datas). Para
 * cada data, usa a foto (snapshot) mais recente <= data alvo (exata, valor+qtd).
 * Para datas anteriores à 1ª foto, reconstrói a QUANTIDADE pelos movimentos
 * (exata) e NÃO inventa valor (valor exato comparável só a partir da 1ª foto).
 * ──────────────────────────────────────────────────────────────────────────── */
export interface EstoqueComparativoPonto {
  dataAlvo: string;
  dataUsada: string | null;
  fonte: "snapshot" | "reconstrucao";
  valor: number | null; // exato (snapshot); null quando reconstruído (sem foto)
  quantidade: number; // exato nos dois casos
  aviso?: string;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function pontoEstoqueNaData(
  prisma: PrismaClient,
  dataAlvo: string,
): Promise<EstoqueComparativoPonto> {
  const alvo = new Date(`${dataAlvo}T00:00:00.000Z`);
  // Foto mais recente dentro da janela coberta pela plataforma: entre a data de inicio das
  // analises e a data alvo. Sem o piso, uma foto anterior ao corte seria usada como se
  // fosse a "mais proxima disponivel" , justamente o historico que a plataforma declara
  // nao considerar. Sem foto no intervalo, cai na reconstrucao (com aviso honesto).
  const foto = await prisma.fatoEstoqueSaldoSnapshot.findFirst({
    where: { dataRef: { gte: corteAtualDate(), lte: alvo } },
    orderBy: { dataRef: "desc" },
    select: { dataRef: true },
  });
  if (foto) {
    const agg = await prisma.fatoEstoqueSaldoSnapshot.aggregate({
      where: { dataRef: foto.dataRef },
      _sum: { vrSaldo: true, quantidade: true },
    });
    const dataUsada = isoDate(foto.dataRef);
    return {
      dataAlvo,
      dataUsada,
      fonte: "snapshot",
      valor: Number(agg._sum.vrSaldo ?? 0),
      quantidade: Number(agg._sum.quantidade ?? 0),
      ...(dataUsada !== dataAlvo
        ? { aviso: `Sem foto exata de ${dataAlvo}; usei a mais próxima disponível (${dataUsada}).` }
        : {}),
    };
  }
  // Sem foto <= data alvo: reconstrói a QUANTIDADE pelos movimentos (exata).
  // quantidade(alvo) = quantidade(hoje) − (entradas − saídas) ocorridas DEPOIS do alvo.
  const [saldoHoje, entradas, saidas] = await Promise.all([
    prisma.fatoEstoqueSaldo.aggregate({ _sum: { quantidade: true } }),
    prisma.fatoEstoqueMovimento.aggregate({
      where: { sentido: "entrada", data: { gt: alvo } },
      _sum: { quantidade: true },
    }),
    prisma.fatoEstoqueMovimento.aggregate({
      where: { sentido: "saida", data: { gt: alvo } },
      _sum: { quantidade: true },
    }),
  ]);
  const qtdHoje = Number(saldoHoje._sum.quantidade ?? 0);
  const netDepois =
    Number(entradas._sum.quantidade ?? 0) - Number(saidas._sum.quantidade ?? 0);
  return {
    dataAlvo,
    dataUsada: null,
    fonte: "reconstrucao",
    valor: null,
    quantidade: qtdHoje - netDepois,
    aviso:
      `Não há foto de estoque em ${dataAlvo} (anterior ao início do histórico de fotos). ` +
      `Não há base confiável para um comparativo preciso nessa data; a comparação histórica exata ` +
      `passa a valer a partir da 1ª foto. (Quantidade reconstruída pelos movimentos é apenas estimativa.)`,
  };
}

export async function queryEstoqueComparativo(
  prisma: PrismaClient,
  filtros: { dataInicial: string; dataFinal: string },
): Promise<{
  inicial: EstoqueComparativoPonto;
  final: EstoqueComparativoPonto;
  deltaValor: number | null;
  deltaValorPct: number | null;
  deltaQuantidade: number;
  comparavelEmValor: boolean;
  primeiraFoto: string | null;
  /** Presente so quando a data pedida foi puxada para a data de inicio das analises. */
  avisoCorte?: string;
}> {
  // As duas datas sao grampeadas a data de inicio das analises: comparar contra uma data
  // que a plataforma nao cobre devolveria numero que ela declara nao considerar.
  const dataInicial = clampIsoAoCorte(filtros.dataInicial.slice(0, 10));
  const dataFinal = clampIsoAoCorte(filtros.dataFinal.slice(0, 10));
  const cortou =
    pedeAntesDoCorte(filtros.dataInicial.slice(0, 10)) ||
    pedeAntesDoCorte(filtros.dataFinal.slice(0, 10));

  const [inicial, final, primeira] = await Promise.all([
    pontoEstoqueNaData(prisma, dataInicial),
    pontoEstoqueNaData(prisma, dataFinal),
    prisma.fatoEstoqueSaldoSnapshot.findFirst({
      // 1a foto DENTRO da janela coberta (idem pontoEstoqueNaData).
      where: { dataRef: { gte: corteAtualDate() } },
      orderBy: { dataRef: "asc" },
      select: { dataRef: true },
    }),
  ]);
  const comparavelEmValor = inicial.valor !== null && final.valor !== null;
  const deltaValor = comparavelEmValor
    ? (final.valor as number) - (inicial.valor as number)
    : null;
  const deltaValorPct =
    comparavelEmValor && (inicial.valor as number) !== 0
      ? (deltaValor as number) / (inicial.valor as number)
      : null;
  return {
    inicial,
    final,
    deltaValor,
    deltaValorPct,
    deltaQuantidade: final.quantidade - inicial.quantidade,
    comparavelEmValor,
    primeiraFoto: primeira ? isoDate(primeira.dataRef) : null,
    ...(cortou ? { avisoCorte: avisoCorte() } : {}),
  };
}
