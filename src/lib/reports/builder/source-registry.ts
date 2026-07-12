// src/lib/reports/builder/source-registry.ts
// Registry de fontes do construtor: mapeia (fato, shapeDerivado) -> produtor.
// O produtor roda a query auditada certa e monta o RawSourceData padronizado.
// Onda 1: apenas estoque (queries comprovadas). Freshness ligado em B2.
import { prisma } from "@/lib/prisma";
import {
  querySaldoProduto,
  queryConcentracao,
  queryValorArmazem,
  queryEntradasSaidas,
  queryProdutosParados,
  queryTopMovimentados,
} from "@/lib/reports/queries/estoque";
import {
  querySaldoContas,
  queryCaixaPeriodo,
  queryFluxoCaixa,
} from "@/lib/reports/queries/financeiro";
import { queryResultadoPorConta } from "@/lib/reports/queries/financeiro-resultado";
import {
  queryPedidosPeriodo,
  queryPedidosPorEtapa,
  queryPedidosPorVendedor,
  queryPedidosAtrasados,
} from "@/lib/reports/queries/comercial";
import {
  queryFaturamentoPeriodo,
  queryFaturamentoPorCliente,
  queryProdutosFaturados,
} from "@/lib/reports/queries/fiscal";
import { queryContarParceiros, queryParceirosPorUf } from "@/lib/reports/queries/cadastros";
import { queryPlanoDeContas } from "@/lib/reports/queries/contabil";
import { queryPrecoProduto } from "@/lib/reports/queries/precos";
import { queryServicoListar } from "@/lib/reports/queries/servicos";
import {
  clampIsoAoCorte,
  clampMesAoCorte,
  corteAtual,
  getCorteDados,
  janelaClampada,
} from "@/lib/corte-dados";
import { janelaAnterior } from "./janela-anterior";
import type {
  RawSourceData,
  ShapeDerivado,
  SourceContract,
} from "./types";

export type FiltrosFonte = {
  armazemId?: number;
  familiaId?: number;
  termo?: string;
  /** Dias minimos parado (fato_estoque_parados). */
  faixaDias?: number;
  /** Sentido do movimento: "entrada" | "saida" (fato_estoque_top_movimentados). */
  sentido?: string;
  /** Nome (ou parte) da marca para recortar um KPI por marca (ex.: "Matrix"). */
  marca?: string;
  /** Janela temporal (mes "YYYY-MM") , so afeta fatos com serie temporal (movimento). */
  periodoDe?: string;
  periodoAte?: string;
};

type Produtor = (filtros: FiltrosFonte) => Promise<RawSourceData>;

// ===========================================================================
// DATA DE INICIO DAS ANALISES (AppSetting sync.corte_dados) , piso obrigatorio.
//
// Este registry e o ponto por onde TODA leitura do construtor passa (relatorio salvo,
// preview do construtor e a amostra que o motor de geracao mostra ao critico). Por isso
// o piso mora AQUI, dentro do produtor: nenhum chamador consegue escapar, nem quem
// chama `produtor({})` sem filtro nenhum.
//
// Duas familias de fonte, dois formatos de periodo:
//   - fontes com coluna de DATA (financeiro, comercial, fiscal) -> "AAAA-MM-DD";
//   - fontes cujo eixo e o MES (fato_estoque_movimento.mes) -> "AAAA-MM".
// O construtor aceita o periodo nos dois formatos, entao a normalizacao acontece aqui.
//
// Nao se aplica a: saldo de estoque (foto de hoje), cadastros (parceiro/UF), plano de
// contas, tabela de preco e catalogo de servico , nenhum e historico com data.
// ===========================================================================

/** Teto aberto: a regra impoe PISO (inicio das analises), nunca teto. */
const DIA_ABERTO = "2100-01-01";
const MES_ABERTO = "9999-12";

/**
 * Le a data configurada e mantem quente o cache do processo. Barato (TTL de 60s no
 * corte-dados) e garante que o registry nao dependa do entrypoint ter hidratado.
 */
async function corteVigente(): Promise<string> {
  return getCorteDados(prisma);
}

/** "AAAA-MM" -> primeiro dia do mes. "AAAA-MM-DD" passa direto. */
function primeiroDia(p?: string): string | undefined {
  if (!p) return undefined;
  return /^\d{4}-\d{2}$/.test(p) ? `${p}-01` : p;
}

/** "AAAA-MM" -> ultimo dia do mes. "AAAA-MM-DD" passa direto. */
function ultimoDia(p?: string): string | undefined {
  if (!p) return undefined;
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  if (!m) return p;
  const ultimo = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
  return `${p}-${String(ultimo).padStart(2, "0")}`;
}

/**
 * Periodo em DIAS ("AAAA-MM-DD") para as fontes que filtram por coluna de data.
 * Sem periodo, o piso e o corte (a fonte nunca varre o cache inteiro); pedindo antes
 * do corte, comeca no corte.
 */
async function periodoEmDias(f: FiltrosFonte): Promise<{ periodoDe: string; periodoAte: string }> {
  const corte = await corteVigente();
  const j = janelaClampada(primeiroDia(f.periodoDe), ultimoDia(f.periodoAte), corte);
  return { periodoDe: j.deIso, periodoAte: j.ateIso ?? DIA_ABERTO };
}

/**
 * Periodo em MESES ("AAAA-MM") para as fontes cujo eixo e o mes (movimento de estoque).
 * O mes do corte entra inteiro (ver clampMesAoCorte): com corte em 16/03, o balde de
 * marco ainda soma os movimentos de 1 a 15/03.
 */
async function periodoEmMeses(f: FiltrosFonte): Promise<{ periodoDe: string; periodoAte: string }> {
  const corte = await corteVigente();
  return {
    periodoDe: clampMesAoCorte((f.periodoDe ?? corte).slice(0, 7), corte),
    periodoAte: (f.periodoAte ?? MES_ABERTO).slice(0, 7),
  };
}

/**
 * Grampeia o inicio do periodo PEDIDO ao corte, no formato em que ele veio (mes ou dia).
 * Usado pelas server actions, que recebem o periodo cru do browser. Periodo ausente
 * segue ausente de proposito: o PISO e aplicado no produtor, que conhece o formato da
 * sua propria fonte.
 */
export function clamparPeriodoPedido<T extends { periodoDe?: string; periodoAte?: string }>(
  filtros: T,
  corte: string = corteAtual(),
): T {
  if (!filtros.periodoDe) return filtros;
  const periodoDe = /^\d{4}-\d{2}$/.test(filtros.periodoDe)
    ? clampMesAoCorte(filtros.periodoDe, corte)
    : clampIsoAoCorte(filtros.periodoDe, corte);
  return { ...filtros, periodoDe };
}

/**
 * Encurta o nome longo de uma conta bancaria para o eixo do grafico. O formato vem
 * como "Itau / Corrente / 1584 / 36410-1 / Nome da Empresa 34.461.908/0001-14": tira
 * o CNPJ do fim e fica so com o ultimo segmento (o nome da empresa). A tabela continua
 * mostrando o nome completo.
 */
function rotuloConta(nome: string): string {
  const semCnpj = nome.replace(/\s*\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\s*$/, "").trim();
  const segs = semCnpj.split(" / ").map((s) => s.trim()).filter(Boolean);
  return segs[segs.length - 1] || semCnpj || nome;
}

interface FonteDef {
  contract: SourceContract;
  produtores: Partial<Record<ShapeDerivado, Produtor>>;
}

// SALDO de estoque: foto de HOJE, nao historico. A data de inicio das analises nao se
// aplica (nao ha documento com data a filtrar) , o mesmo vale para as dimensoes armazem,
// marca, familia e local, que sao recortes desse mesmo saldo.
const fatoEstoqueSaldo: FonteDef = {
  contract: {
    fato: "fato_estoque_saldo",
    modeloFonte: "estoque.saldo.hoje",
    dominio: "estoque",
    shapes: ["tabela", "kpis", "agregacaoCategorica", "medidor"],
    campos: {
      tabela: [
        { key: "produtoNome", label: "Produto", tipo: "texto" },
        { key: "familiaNome", label: "Familia", tipo: "texto" },
        { key: "marcaNome", label: "Marca", tipo: "texto" },
        { key: "saldoTotal", label: "Saldo", tipo: "numero" },
        { key: "valorTotal", label: "Valor", tipo: "moeda" },
      ],
      kpis: [
        { key: "totalProdutos", label: "Produtos", tipo: "numero" },
        { key: "produtosNegativos", label: "Negativos", tipo: "numero" },
        { key: "valorTotal", label: "Valor total", tipo: "moeda" },
      ],
      agregacaoCategorica: [
        { key: "rotulo", label: "Categoria", tipo: "texto" },
        { key: "valor", label: "Valor", tipo: "moeda" },
      ],
      medidor: [
        { key: "valor", label: "Percentual", tipo: "percentual" },
        { key: "max", label: "Maximo", tipo: "numero" },
        { key: "label", label: "Rotulo", tipo: "texto" },
      ],
    },
  },
  produtores: {
    tabela: async (filtros) => {
      const d = await querySaldoProduto(prisma, filtros);
      return {
        linhas: d.linhas as unknown as Record<string, unknown>[],
        kpis: { ...d.kpis },
        freshness: null,
      };
    },
    kpis: async (filtros) => {
      const d = await querySaldoProduto(prisma, filtros);
      return { linhas: [], kpis: { ...d.kpis }, freshness: null };
    },
    // Medidor de saude: % de produtos com saldo negativo (derivado dos KPIs).
    medidor: async (filtros) => {
      const d = await querySaldoProduto(prisma, filtros);
      const total = Number(d.kpis.totalProdutos ?? 0);
      const neg = Number(d.kpis.produtosNegativos ?? 0);
      const pct = total > 0 ? (neg / total) * 100 : 0;
      return { linhas: [{ valor: pct, max: 100, label: "Produtos negativos" }], freshness: null };
    },
    agregacaoCategorica: async () => {
      const d = await queryConcentracao(prisma);
      return {
        linhas: d.familiasBruto as unknown as Record<string, unknown>[],
        freshness: null,
      };
    },
  },
};

// --- Dimensao ARMAZEM: valor/produtos por armazem (queryValorArmazem). ---
const fatoEstoqueArmazem: FonteDef = {
  contract: {
    fato: "fato_estoque_armazem",
    modeloFonte: "estoque.saldo.hoje",
    dominio: "estoque",
    shapes: ["agregacaoCategorica", "kpis", "tabela"],
    campos: {
      agregacaoCategorica: [
        { key: "rotulo", label: "Armazem", tipo: "texto" },
        { key: "valor", label: "Valor", tipo: "moeda" },
      ],
      kpis: [
        { key: "valorTotal", label: "Valor total", tipo: "moeda" },
        { key: "numArmazens", label: "Armazens", tipo: "numero" },
      ],
      tabela: [
        { key: "armazem", label: "Armazem", tipo: "texto" },
        { key: "numProdutos", label: "Produtos", tipo: "numero" },
        { key: "valor", label: "Valor", tipo: "moeda" },
      ],
    },
  },
  produtores: {
    agregacaoCategorica: async () => {
      const d = await queryValorArmazem(prisma);
      return { linhas: d.linhasBruto.map((l) => ({ rotulo: l.armazem, valor: l.valor })), freshness: null };
    },
    kpis: async () => {
      const d = await queryValorArmazem(prisma);
      return { linhas: [], kpis: { valorTotal: d.kpis.valorTotal, numArmazens: d.kpis.numArmazens }, freshness: null };
    },
    tabela: async () => {
      const d = await queryValorArmazem(prisma);
      return { linhas: d.linhasBruto as unknown as Record<string, unknown>[], freshness: null };
    },
  },
};

// --- ONDE cada produto esta: produto x armazem (querySaldoProduto.detalhePorLocal). ---
const fatoEstoqueLocalProduto: FonteDef = {
  contract: {
    fato: "fato_estoque_local_produto",
    modeloFonte: "estoque.saldo.hoje",
    dominio: "estoque",
    shapes: ["tabela"],
    campos: {
      tabela: [
        { key: "produtoNome", label: "Produto", tipo: "texto" },
        { key: "armazem", label: "Armazem", tipo: "texto" },
        { key: "saldo", label: "Saldo", tipo: "numero" },
        { key: "valor", label: "Valor", tipo: "moeda" },
      ],
    },
  },
  produtores: {
    tabela: async (filtros) => {
      const d = await querySaldoProduto(prisma, { armazemId: filtros.armazemId, familiaId: filtros.familiaId });
      const linhas: Record<string, unknown>[] = [];
      for (const p of d.linhas) {
        for (const loc of p.detalhePorLocal) {
          linhas.push({ produtoNome: p.produtoNome, armazem: loc.localRotulo, saldo: loc.saldo, valor: loc.valor });
        }
      }
      return { linhas, freshness: null };
    },
  },
};

// --- Dimensao MARCA: valor por marca (queryConcentracao.marcasBruto). ---
const fatoEstoqueMarca: FonteDef = {
  contract: {
    fato: "fato_estoque_marca",
    modeloFonte: "estoque.saldo.hoje",
    dominio: "estoque",
    shapes: ["agregacaoCategorica", "kpis", "tabela"],
    campos: {
      agregacaoCategorica: [
        { key: "rotulo", label: "Marca", tipo: "texto" },
        { key: "valor", label: "Valor", tipo: "moeda" },
      ],
      kpis: [
        { key: "valorMarca", label: "Valor em estoque (marca)", tipo: "moeda" },
        { key: "marcasTotal", label: "Marcas no estoque", tipo: "numero" },
      ],
      tabela: [
        { key: "marca", label: "Marca", tipo: "texto" },
        { key: "valor", label: "Valor", tipo: "moeda" },
      ],
    },
  },
  produtores: {
    agregacaoCategorica: async () => {
      const d = await queryConcentracao(prisma);
      return { linhas: d.marcasBruto, freshness: null };
    },
    // KPI recortado por marca: usa filtros.marca (match por trecho, case-insensitive).
    // Sem filtro, o valorMarca soma todas as marcas (total geral).
    kpis: async (filtros) => {
      const d = await queryConcentracao(prisma);
      const alvo = (filtros.marca ?? "").trim().toLowerCase();
      const valorMarca = alvo
        ? d.marcasBruto
            .filter((m) => m.rotulo.toLowerCase().includes(alvo))
            .reduce((acc, m) => acc + m.valor, 0)
        : d.marcasBruto.reduce((acc, m) => acc + m.valor, 0);
      return { linhas: [], kpis: { valorMarca, marcasTotal: d.marcasBruto.length }, freshness: null };
    },
    tabela: async () => {
      const d = await queryConcentracao(prisma);
      return { linhas: d.marcasBruto.map((m) => ({ marca: m.rotulo, valor: m.valor })), freshness: null };
    },
  },
};

// --- Dimensao FAMILIA explicita (queryConcentracao.familiasBruto). ---
const fatoEstoqueFamilia: FonteDef = {
  contract: {
    fato: "fato_estoque_familia",
    modeloFonte: "estoque.saldo.hoje",
    dominio: "estoque",
    shapes: ["agregacaoCategorica", "tabela"],
    campos: {
      agregacaoCategorica: [
        { key: "rotulo", label: "Familia", tipo: "texto" },
        { key: "valor", label: "Valor", tipo: "moeda" },
      ],
      tabela: [
        { key: "familia", label: "Familia", tipo: "texto" },
        { key: "valor", label: "Valor", tipo: "moeda" },
      ],
    },
  },
  produtores: {
    agregacaoCategorica: async () => {
      const d = await queryConcentracao(prisma);
      return { linhas: d.familiasBruto, freshness: null };
    },
    tabela: async () => {
      const d = await queryConcentracao(prisma);
      return { linhas: d.familiasBruto.map((f) => ({ familia: f.rotulo, valor: f.valor })), freshness: null };
    },
  },
};

// --- MOVIMENTO: entradas/saidas por mes (serie temporal) + detalhe. ---
const fatoEstoqueMovimento: FonteDef = {
  contract: {
    fato: "fato_estoque_movimento",
    modeloFonte: "estoque.movimento",
    dominio: "estoque",
    shapes: ["serieTemporal", "tabela"],
    campos: {
      serieTemporal: [
        { key: "mes", label: "Mes", tipo: "texto" },
        { key: "entrada", label: "Entradas", tipo: "numero" },
        { key: "saida", label: "Saidas", tipo: "numero" },
      ],
      tabela: [
        { key: "mes", label: "Mes", tipo: "texto" },
        { key: "sentido", label: "Sentido", tipo: "texto" },
        { key: "produto", label: "Produto", tipo: "texto" },
        { key: "quantidade", label: "Quantidade", tipo: "numero" },
      ],
    },
  },
  produtores: {
    // Movimento de estoque e HISTORICO (documento com data): piso na data de inicio
    // das analises. Sem periodo, a serie comeca no mes do corte, nunca no cache inteiro.
    serieTemporal: async (filtros) => {
      const d = await queryEntradasSaidas(prisma, {
        armazemId: filtros.armazemId,
        ...(await periodoEmMeses(filtros)),
      });
      return { linhas: d.serie as unknown as Record<string, unknown>[], freshness: null };
    },
    tabela: async (filtros) => {
      const d = await queryEntradasSaidas(prisma, {
        armazemId: filtros.armazemId,
        ...(await periodoEmMeses(filtros)),
      });
      return { linhas: d.detalhe as unknown as Record<string, unknown>[], freshness: null };
    },
  },
};

// --- PRODUTOS PARADOS: kpis + tabela (queryProdutosParados). ---
// Estado derivado ("ha quantos dias este item nao se mexe"), montado pelo worker sobre o
// historico INGERIDO, nao um documento com data que de para filtrar aqui. Sem periodo a
// clampar neste ponto: quem decide a semantica de "dias parado" e o builder do fato.
const fatoEstoqueParados: FonteDef = {
  contract: {
    fato: "fato_estoque_parados",
    modeloFonte: "estoque.parado",
    dominio: "estoque",
    shapes: ["kpis", "tabela"],
    campos: {
      kpis: [
        { key: "totalParados", label: "Itens parados", tipo: "numero" },
        { key: "valorImobilizado", label: "Valor imobilizado", tipo: "moeda" },
      ],
      tabela: [
        { key: "produtoNome", label: "Produto", tipo: "texto" },
        { key: "localNome", label: "Armazem", tipo: "texto" },
        { key: "dias", label: "Dias parado", tipo: "numero" },
        { key: "saldo", label: "Saldo", tipo: "numero" },
        { key: "vrSaldo", label: "Valor", tipo: "moeda" },
      ],
    },
  },
  produtores: {
    kpis: async (filtros) => {
      const d = await queryProdutosParados(prisma, { faixaDias: filtros.faixaDias, armazemId: filtros.armazemId });
      return { linhas: [], kpis: { totalParados: d.kpis.totalParados, valorImobilizado: d.kpis.valorImobilizado }, freshness: null };
    },
    tabela: async (filtros) => {
      const d = await queryProdutosParados(prisma, { faixaDias: filtros.faixaDias, armazemId: filtros.armazemId });
      return { linhas: d.linhas as unknown as Record<string, unknown>[], freshness: null };
    },
  },
};

// --- TOP MOVIMENTADOS: produtos mais movimentados (queryTopMovimentados). ---
const fatoEstoqueTopMovimentados: FonteDef = {
  contract: {
    fato: "fato_estoque_top_movimentados",
    modeloFonte: "estoque.movimento",
    dominio: "estoque",
    shapes: ["agregacaoCategorica", "kpis"],
    campos: {
      agregacaoCategorica: [
        { key: "rotulo", label: "Produto", tipo: "texto" },
        { key: "valor", label: "Unidades movimentadas", tipo: "numero" },
      ],
      kpis: [
        { key: "totalProdutos", label: "Produtos", tipo: "numero" },
        { key: "totalUnidades", label: "Unidades", tipo: "numero" },
      ],
    },
  },
  produtores: {
    // Ranking sobre o movimento (historico): o periodo nem chegava a ser repassado,
    // entao somava o cache inteiro. Agora vai clampado ao inicio das analises.
    agregacaoCategorica: async (filtros) => {
      const d = await queryTopMovimentados(prisma, {
        sentido: filtros.sentido,
        ...(await periodoEmMeses(filtros)),
      });
      return { linhas: d.linhas, freshness: null };
    },
    kpis: async (filtros) => {
      const d = await queryTopMovimentados(prisma, {
        sentido: filtros.sentido,
        ...(await periodoEmMeses(filtros)),
      });
      return { linhas: [], kpis: { totalProdutos: d.kpis.totalProdutos, totalUnidades: d.kpis.totalUnidades }, freshness: null };
    },
  },
};

// ===========================================================================
// FINANCEIRO (onda 2): saldo bancario, fluxo de caixa (serie) e DRE gerencial.
// Reusa as queries auditadas de queries/financeiro*.ts , so wrap em FonteDef.
// ===========================================================================

// SALDO bancario: foto das contas hoje, nao historico de lancamento. A data de inicio
// das analises nao se aplica (nao ha documento com data a filtrar).
const fatoFinanceiroSaldo: FonteDef = {
  contract: {
    fato: "fato_financeiro_saldo",
    modeloFonte: "financeiro.saldo",
    dominio: "financeiro",
    shapes: ["kpis", "agregacaoCategorica", "tabela"],
    campos: {
      kpis: [{ key: "saldoTotal", label: "Saldo total", tipo: "moeda" }],
      agregacaoCategorica: [
        { key: "rotulo", label: "Banco", tipo: "texto" },
        { key: "valor", label: "Saldo", tipo: "moeda" },
      ],
      tabela: [
        { key: "bancoNome", label: "Banco", tipo: "texto" },
        { key: "tipo", label: "Tipo", tipo: "texto" },
        { key: "saldo", label: "Saldo", tipo: "moeda" },
      ],
    },
  },
  produtores: {
    kpis: async () => {
      const d = await querySaldoContas(prisma);
      return { linhas: [], kpis: { saldoTotal: d.saldoTotal }, freshness: null };
    },
    agregacaoCategorica: async () => {
      const d = await querySaldoContas(prisma);
      return {
        linhas: d.contas.map((c) => ({ rotulo: rotuloConta(c.bancoNome ?? "(sem banco)"), valor: c.saldo })),
        freshness: null,
      };
    },
    tabela: async () => {
      const d = await querySaldoContas(prisma);
      return { linhas: d.contas as unknown as Record<string, unknown>[], freshness: null };
    },
  },
};

const fatoFinanceiroMovimento: FonteDef = {
  contract: {
    fato: "fato_financeiro_movimento",
    modeloFonte: "financeiro.movimento",
    dominio: "financeiro",
    shapes: ["kpis", "serieTemporal"],
    campos: {
      kpis: [
        { key: "entrada", label: "Entradas", tipo: "moeda" },
        { key: "saida", label: "Saidas", tipo: "moeda" },
        { key: "saldo", label: "Caixa liquido", tipo: "moeda" },
      ],
      serieTemporal: [
        { key: "mes", label: "Mes", tipo: "texto" },
        { key: "realizado", label: "Realizado", tipo: "moeda" },
        { key: "previsto", label: "Previsto", tipo: "moeda" },
      ],
    },
  },
  produtores: {
    // Lancamento financeiro e historico: piso no corte. O delta so sai quando existe
    // uma janela anterior DENTRO da janela analisada (janelaAnterior devolve null caso
    // contrario) , nada de comparar com um periodo que a plataforma nem le.
    kpis: async (filtros) => {
      const d = await queryCaixaPeriodo(prisma, await periodoEmDias(filtros));
      const ja = janelaAnterior(filtros.periodoDe, filtros.periodoAte, await corteVigente());
      let kpisAnterior: Record<string, number> | undefined;
      if (ja) {
        const a = await queryCaixaPeriodo(prisma, await periodoEmDias({ periodoDe: ja.de, periodoAte: ja.ate }));
        kpisAnterior = { entrada: a.entrada, saida: a.saida, saldo: a.saldo };
      }
      return { linhas: [], kpis: { entrada: d.entrada, saida: d.saida, saldo: d.saldo }, kpisAnterior, freshness: null };
    },
    serieTemporal: async (filtros) => {
      const d = await queryFluxoCaixa(prisma, await periodoEmDias(filtros));
      return {
        linhas: d.serie.map((s) => ({ mes: s.periodo, realizado: s.realizado, previsto: s.previsto })),
        freshness: null,
      };
    },
  },
};

const fatoFinanceiroResultado: FonteDef = {
  contract: {
    fato: "fato_financeiro_resultado",
    modeloFonte: "financeiro.resultado",
    dominio: "financeiro",
    shapes: ["kpis", "agregacaoCategorica", "cascata"],
    campos: {
      kpis: [
        { key: "totalReceita", label: "Receita", tipo: "moeda" },
        { key: "totalDespesa", label: "Despesa", tipo: "moeda" },
        { key: "resultado", label: "Resultado", tipo: "moeda" },
      ],
      agregacaoCategorica: [
        { key: "rotulo", label: "Conta gerencial", tipo: "texto" },
        { key: "valor", label: "Valor", tipo: "moeda" },
      ],
      cascata: [
        { key: "rotulo", label: "Passo", tipo: "texto" },
        { key: "valor", label: "Valor", tipo: "moeda" },
        { key: "tipo", label: "Sinal", tipo: "texto" },
      ],
    },
  },
  produtores: {
    // Lancamento contabil e historico (dataDocumento): piso no corte nos tres shapes,
    // senao a DRE gerencial soma documentos fora da janela de analise.
    kpis: async (filtros) => {
      const d = await queryResultadoPorConta(prisma, await periodoEmDias(filtros));
      return {
        linhas: [],
        kpis: { totalReceita: d.totalReceita, totalDespesa: d.totalDespesa, resultado: d.resultado },
        freshness: null,
      };
    },
    agregacaoCategorica: async (filtros) => {
      const d = await queryResultadoPorConta(prisma, await periodoEmDias(filtros));
      return {
        linhas: d.linhas.map((l) => ({ rotulo: l.contaNome ?? "(sem conta)", valor: l.total })),
        freshness: null,
      };
    },
    // DRE em cascata: Receitas (sobe) -> top despesas por conta (descem) ->
    // Outras despesas (resto) -> Resultado (barra total reancorada no zero).
    cascata: async (filtros) => {
      const d = await queryResultadoPorConta(prisma, await periodoEmDias(filtros));
      if (d.totalReceita === 0 && d.totalDespesa === 0 && d.linhas.length === 0) {
        return { linhas: [], freshness: null };
      }
      const despesas = d.linhas.filter((l) => l.natureza === "despesa");
      const TOPN = 5;
      const top = despesas.slice(0, TOPN);
      // Resto = tudo que nao esta no top, derivado do TOTAL (nao da soma das linhas
      // exibidas, que o query limita): garante Receitas - despesas = Resultado exato.
      const somaTop = top.reduce((s, l) => s + l.total, 0);
      const resto = d.totalDespesa - somaTop;
      const passos: Record<string, unknown>[] = [
        { rotulo: "Receitas", valor: d.totalReceita, tipo: "positivo" },
        ...top.map((l) => ({ rotulo: l.contaNome ?? "(sem conta)", valor: l.total, tipo: "negativo" })),
      ];
      if (resto > 0.005) passos.push({ rotulo: "Outras despesas", valor: resto, tipo: "negativo" });
      passos.push({ rotulo: "Resultado", valor: d.resultado, tipo: "total" });
      return { linhas: passos, freshness: null };
    },
  },
};

// ===========================================================================
// COMERCIAL (onda 3): pedidos , KPIs, por etapa, por vendedor, atrasados.
// ===========================================================================

const fatoComercialPedido: FonteDef = {
  contract: {
    fato: "fato_comercial_pedido",
    modeloFonte: "comercial.pedido",
    dominio: "comercial",
    shapes: ["kpis", "tabela"],
    campos: {
      kpis: [
        { key: "totalPedidos", label: "Pedidos", tipo: "numero" },
        { key: "valorTotal", label: "Valor em pedidos", tipo: "moeda" },
      ],
      tabela: [
        { key: "participanteNome", label: "Cliente", tipo: "texto" },
        { key: "numero", label: "Numero", tipo: "texto" },
        { key: "valor", label: "Valor", tipo: "moeda" },
        { key: "diasAtraso", label: "Dias em atraso", tipo: "numero" },
      ],
    },
  },
  produtores: {
    // Pedido e documento com data (dataOrcamento): piso no corte, e delta so com base
    // dentro da janela analisada.
    kpis: async (filtros) => {
      const d = await queryPedidosPeriodo(prisma, await periodoEmDias(filtros));
      const ja = janelaAnterior(filtros.periodoDe, filtros.periodoAte, await corteVigente());
      let kpisAnterior: Record<string, number> | undefined;
      if (ja) {
        const a = await queryPedidosPeriodo(prisma, await periodoEmDias({ periodoDe: ja.de, periodoAte: ja.ate }));
        kpisAnterior = { totalPedidos: a.totalPedidos, valorTotal: a.valorTotal };
      }
      return { linhas: [], kpis: { totalPedidos: d.totalPedidos, valorTotal: d.valorTotal }, kpisAnterior, freshness: null };
    },
    // Parcelas atrasadas: o piso vem do PEDIDO PAI dentro da propria query
    // (queryPedidosAtrasados so olha pedido com dataOrcamento >= corte), porque a
    // parcela nao carrega a data do documento. Nao ha periodo a passar aqui.
    tabela: async () => {
      const d = await queryPedidosAtrasados(prisma, new Date(), { limit: 200 });
      return { linhas: d.linhas as unknown as Record<string, unknown>[], freshness: null };
    },
  },
};

const fatoComercialEtapa: FonteDef = {
  contract: {
    fato: "fato_comercial_etapa",
    modeloFonte: "comercial.pedido",
    dominio: "comercial",
    shapes: ["agregacaoCategorica"],
    campos: {
      agregacaoCategorica: [
        { key: "rotulo", label: "Etapa", tipo: "texto" },
        { key: "valor", label: "Valor", tipo: "moeda" },
      ],
    },
  },
  produtores: {
    // Funil por etapa: agregado sobre pedidos (documentos com data), entao vai com o
    // periodo clampado , um pedido de 2024 parado numa etapa nao pode inflar a etapa.
    agregacaoCategorica: async (filtros) => {
      const d = await queryPedidosPorEtapa(prisma, await periodoEmDias(filtros));
      return {
        linhas: d.linhas.map((l) => ({ rotulo: l.etapaNome ?? "(sem etapa)", valor: l.valorTotal })),
        freshness: null,
      };
    },
  },
};

const fatoComercialVendedor: FonteDef = {
  contract: {
    fato: "fato_comercial_vendedor",
    modeloFonte: "comercial.pedido",
    dominio: "comercial",
    shapes: ["agregacaoCategorica"],
    campos: {
      agregacaoCategorica: [
        { key: "rotulo", label: "Vendedor", tipo: "texto" },
        { key: "valor", label: "Valor", tipo: "moeda" },
      ],
    },
  },
  produtores: {
    // Ranking de vendedores sobre pedidos (historico): piso no corte.
    agregacaoCategorica: async (filtros) => {
      const d = await queryPedidosPorVendedor(prisma, await periodoEmDias(filtros));
      return {
        linhas: d.linhas.map((l) => ({ rotulo: l.vendedorNome ?? "(sem vendedor)", valor: l.valorTotal })),
        freshness: null,
      };
    },
  },
};

// ===========================================================================
// FISCAL (onda 4): faturamento (NF de saida) , KPIs, por cliente, por produto.
// ===========================================================================

const fatoFiscalFaturamento: FonteDef = {
  contract: {
    fato: "fato_fiscal_faturamento",
    modeloFonte: "fiscal.nota",
    dominio: "fiscal",
    shapes: ["kpis"],
    campos: {
      kpis: [
        { key: "totalNotas", label: "Notas emitidas", tipo: "numero" },
        { key: "valorFaturado", label: "Valor faturado", tipo: "moeda" },
      ],
    },
  },
  produtores: {
    // Nota fiscal e o historico mais visivel (a diretoria olha esse numero): piso no
    // corte e, sem base anterior dentro da janela, NENHUM delta.
    kpis: async (filtros) => {
      const d = await queryFaturamentoPeriodo(prisma, await periodoEmDias(filtros));
      const ja = janelaAnterior(filtros.periodoDe, filtros.periodoAte, await corteVigente());
      let kpisAnterior: Record<string, number> | undefined;
      if (ja) {
        const a = await queryFaturamentoPeriodo(prisma, await periodoEmDias({ periodoDe: ja.de, periodoAte: ja.ate }));
        kpisAnterior = { totalNotas: a.totalNotas, valorFaturado: a.valorFaturado };
      }
      return { linhas: [], kpis: { totalNotas: d.totalNotas, valorFaturado: d.valorFaturado }, kpisAnterior, freshness: null };
    },
  },
};

const fatoFiscalCliente: FonteDef = {
  contract: {
    fato: "fato_fiscal_cliente",
    modeloFonte: "fiscal.nota",
    dominio: "fiscal",
    shapes: ["agregacaoCategorica"],
    campos: {
      agregacaoCategorica: [
        { key: "rotulo", label: "Cliente", tipo: "texto" },
        { key: "valor", label: "Faturado", tipo: "moeda" },
      ],
    },
  },
  produtores: {
    // Faturamento por cliente: notas emitidas (historico), piso no corte.
    agregacaoCategorica: async (filtros) => {
      const d = await queryFaturamentoPorCliente(prisma, await periodoEmDias(filtros));
      return {
        linhas: d.linhas.map((l) => ({ rotulo: l.participanteNome ?? "(sem cliente)", valor: l.valorTotal })),
        freshness: null,
      };
    },
  },
};

const fatoFiscalProduto: FonteDef = {
  contract: {
    fato: "fato_fiscal_produto",
    modeloFonte: "fiscal.nota",
    dominio: "fiscal",
    shapes: ["agregacaoCategorica"],
    campos: {
      agregacaoCategorica: [
        { key: "rotulo", label: "Produto", tipo: "texto" },
        { key: "valor", label: "Faturado", tipo: "moeda" },
      ],
    },
  },
  produtores: {
    // Produtos faturados: itens de nota (historico), piso no corte.
    agregacaoCategorica: async (filtros) => {
      const d = await queryProdutosFaturados(prisma, await periodoEmDias(filtros));
      return {
        linhas: d.linhas.map((l) => ({ rotulo: l.produtoNome ?? "(sem produto)", valor: l.valorTotal })),
        freshness: null,
      };
    },
  },
};

// ===========================================================================
// CADASTROS (onda 5): parceiros , KPIs (clientes/fornecedores/ativos) e por UF.
// Cadastro nao e historico: a data de inicio das analises nao se aplica (um cliente
// cadastrado em 2019 continua sendo cliente hoje).
// ===========================================================================

const fatoCadastrosParceiro: FonteDef = {
  contract: {
    fato: "fato_cadastros_parceiro",
    modeloFonte: "cadastros.parceiro",
    dominio: "cadastros",
    shapes: ["kpis"],
    campos: {
      kpis: [
        { key: "totalClientes", label: "Clientes", tipo: "numero" },
        { key: "totalFornecedores", label: "Fornecedores", tipo: "numero" },
        { key: "totalAtivos", label: "Ativos", tipo: "numero" },
      ],
    },
  },
  produtores: {
    kpis: async () => {
      const d = await queryContarParceiros(prisma);
      return {
        linhas: [],
        kpis: { totalClientes: d.totalClientes, totalFornecedores: d.totalFornecedores, totalAtivos: d.totalAtivos },
        freshness: null,
      };
    },
  },
};

const fatoCadastrosUf: FonteDef = {
  contract: {
    fato: "fato_cadastros_uf",
    modeloFonte: "cadastros.parceiro",
    dominio: "cadastros",
    shapes: ["agregacaoCategorica"],
    campos: {
      agregacaoCategorica: [
        { key: "rotulo", label: "UF", tipo: "texto" },
        { key: "valor", label: "Parceiros", tipo: "numero" },
      ],
    },
  },
  produtores: {
    agregacaoCategorica: async () => {
      const d = await queryParceirosPorUf(prisma, {});
      return {
        linhas: d.linhas.map((l) => ({ rotulo: l.uf ?? "(sem UF)", valor: l.quantidade })),
        freshness: null,
      };
    },
  },
};

// ===========================================================================
// CONTABIL (plano de contas) + FISCAL ref (precos, servicos) , listagens (TAB).
// Tres catalogos/metadados (plano de contas, tabela de preco, lista de servicos): nenhum
// e documento com data, entao a data de inicio das analises tambem nao se aplica.
// ===========================================================================

const fatoContabilPlano: FonteDef = {
  contract: {
    fato: "fato_contabil_plano",
    modeloFonte: "contabil.conta",
    dominio: "contabil",
    shapes: ["tabela"],
    campos: {
      tabela: [
        { key: "codigo", label: "Codigo", tipo: "texto" },
        { key: "nome", label: "Conta", tipo: "texto" },
        { key: "tipo", label: "Tipo", tipo: "texto" },
        { key: "contaPaiNome", label: "Conta pai", tipo: "texto" },
      ],
    },
  },
  produtores: {
    tabela: async () => {
      const d = await queryPlanoDeContas(prisma, { limit: 500, offset: 0 });
      return { linhas: d.linhas as unknown as Record<string, unknown>[], freshness: null };
    },
  },
};

const fatoFiscalPreco: FonteDef = {
  contract: {
    fato: "fato_fiscal_preco",
    modeloFonte: "fiscal.preco",
    dominio: "fiscal",
    shapes: ["tabela"],
    campos: {
      tabela: [
        { key: "tabelaNome", label: "Tabela", tipo: "texto" },
        { key: "produtoNome", label: "Produto", tipo: "texto" },
        { key: "valor", label: "Preco", tipo: "moeda" },
        { key: "quantidadeMinima", label: "Qtd minima", tipo: "numero" },
      ],
    },
  },
  produtores: {
    tabela: async () => {
      const d = await queryPrecoProduto(prisma, { limit: 500, offset: 0 });
      return { linhas: d.linhas as unknown as Record<string, unknown>[], freshness: null };
    },
  },
};

const fatoFiscalServico: FonteDef = {
  contract: {
    fato: "fato_fiscal_servico",
    modeloFonte: "fiscal.servico",
    dominio: "fiscal",
    shapes: ["tabela"],
    campos: {
      tabela: [
        { key: "codigoFormatado", label: "Codigo", tipo: "texto" },
        { key: "descricao", label: "Servico", tipo: "texto" },
        { key: "codigoTributacao", label: "Cod. tributacao", tipo: "texto" },
      ],
    },
  },
  produtores: {
    tabela: async () => {
      const d = await queryServicoListar(prisma, { limit: 500, offset: 0 });
      return { linhas: d.linhas as unknown as Record<string, unknown>[], freshness: null };
    },
  },
};

const REGISTRY: Record<string, FonteDef> = {
  fato_estoque_saldo: fatoEstoqueSaldo,
  fato_estoque_armazem: fatoEstoqueArmazem,
  fato_estoque_local_produto: fatoEstoqueLocalProduto,
  fato_estoque_marca: fatoEstoqueMarca,
  fato_estoque_familia: fatoEstoqueFamilia,
  fato_estoque_movimento: fatoEstoqueMovimento,
  fato_estoque_parados: fatoEstoqueParados,
  fato_estoque_top_movimentados: fatoEstoqueTopMovimentados,
  fato_financeiro_saldo: fatoFinanceiroSaldo,
  fato_financeiro_movimento: fatoFinanceiroMovimento,
  fato_financeiro_resultado: fatoFinanceiroResultado,
  fato_comercial_pedido: fatoComercialPedido,
  fato_comercial_etapa: fatoComercialEtapa,
  fato_comercial_vendedor: fatoComercialVendedor,
  fato_fiscal_faturamento: fatoFiscalFaturamento,
  fato_fiscal_cliente: fatoFiscalCliente,
  fato_fiscal_produto: fatoFiscalProduto,
  fato_cadastros_parceiro: fatoCadastrosParceiro,
  fato_cadastros_uf: fatoCadastrosUf,
  fato_contabil_plano: fatoContabilPlano,
  fato_fiscal_preco: fatoFiscalPreco,
  fato_fiscal_servico: fatoFiscalServico,
};

/** Lista os contratos publicos de todas as fontes (alimenta o agente). */
export function listarFontes(): SourceContract[] {
  return Object.values(REGISTRY).map((f) => f.contract);
}

/** Contrato de uma fonte por fato. */
export function obterContrato(fato: string): SourceContract | undefined {
  return REGISTRY[fato]?.contract;
}

/** Produtor de dado para um par (fato, shapeDerivado). */
export function obterProdutor(
  fato: string,
  shape: ShapeDerivado,
): Produtor | undefined {
  return REGISTRY[fato]?.produtores[shape];
}
