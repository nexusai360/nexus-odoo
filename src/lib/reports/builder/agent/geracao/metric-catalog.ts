// src/lib/reports/builder/agent/geracao/metric-catalog.ts
// Catalogo de METRICAS: o vocabulario que o compositor manipula. NAO e uma terceira
// fonte de verdade: shape/serie/dimensoes/campoKpi sao DERIVADOS do SourceContract do
// registry; o catalogo so ACRESCENTA o curado-humano (id, rotulo, descricao, pergunta,
// formato, chartPreferido) por medida. Expande 1 fato -> N metricas (uma por KPI do
// shape "kpis"). Filtrado por dominios permitidos (camada 1 do RBAC; o chamador resolve
// os dominios via getMyDomains e passa aqui, mantendo esta funcao pura/sincrona).
import { listarFontes } from "../../source-registry";
import type { ShapeDerivado, SourceContract } from "../../types";
import type { ReportTemplate } from "@/lib/reports/types";

export type FormatoMetrica = "brl" | "contagem" | "percentual" | "dias";

export interface Metrica {
  id: string;
  dominio: string;
  fato: string;
  shape: ShapeDerivado;
  /** Para shape "kpis": chave do objeto kpis de onde sai o escalar (ex.: "valorTotal"). */
  campoKpi?: string;
  rotulo: string;
  descricao: string;
  pergunta: string;
  formato: FormatoMetrica;
  /** Recortes (colunas categoricas) que o fato oferece; derivado do contrato. */
  dimensoes: string[];
  /** Derivado: o fato oferece o shape "serieTemporal". */
  temSerieTemporal: boolean;
  chartPreferido: ReportTemplate;
  chartsValidos: ReportTemplate[];
}

interface Curada {
  id: string;
  rotulo: string;
  descricao: string;
  pergunta: string;
  formato: FormatoMetrica;
  chartPreferido: ReportTemplate;
}

// Curadoria por medida. Chave = `${fato}|${shape}|${campoKpi ?? ""}`.
// So o que esta aqui vira metrica (ids controlados e significativos). Onda 1: estoque.
const CURADORIA: Record<string, Curada> = {
  // --- saldo: panorama de saude ---
  "fato_estoque_saldo|kpis|valorTotal": {
    id: "estoque.valor_total",
    rotulo: "Valor total",
    descricao: "Valor do estoque no momento",
    pergunta: "Quanto vale o estoque hoje?",
    formato: "brl",
    chartPreferido: "KPIRow",
  },
  "fato_estoque_saldo|kpis|totalProdutos": {
    id: "estoque.produtos",
    rotulo: "Produtos",
    descricao: "Produtos distintos em estoque",
    pergunta: "Quantos produtos distintos existem?",
    formato: "contagem",
    chartPreferido: "KPIRow",
  },
  "fato_estoque_saldo|kpis|produtosNegativos": {
    id: "estoque.negativos",
    rotulo: "Negativos",
    descricao: "Produtos com saldo negativo",
    pergunta: "Quantos produtos estao negativos?",
    formato: "contagem",
    chartPreferido: "KPIRow",
  },
  "fato_estoque_saldo|medidor|": {
    id: "estoque.saude_negativos",
    rotulo: "Saude do estoque",
    descricao: "Percentual de produtos com saldo negativo",
    pergunta: "Que fracao dos produtos esta negativa?",
    formato: "percentual",
    chartPreferido: "Gauge",
  },
  "fato_estoque_saldo|tabela|": {
    id: "estoque.saldo_produto",
    rotulo: "Saldo por produto",
    descricao: "Saldo e valor de cada produto",
    pergunta: "Qual o saldo de cada produto?",
    formato: "brl",
    chartPreferido: "DataTable",
  },
  // --- recortes categoricos (rankings) ---
  "fato_estoque_armazem|agregacaoCategorica|": {
    id: "estoque.valor_armazem",
    rotulo: "Valor por armazem",
    descricao: "Valor de estoque em cada armazem",
    pergunta: "Onde esta concentrado o valor do estoque?",
    formato: "brl",
    chartPreferido: "BarChart",
  },
  "fato_estoque_marca|agregacaoCategorica|": {
    id: "estoque.valor_marca",
    rotulo: "Valor por marca",
    descricao: "Valor de estoque por marca",
    pergunta: "Quais marcas concentram valor?",
    formato: "brl",
    chartPreferido: "BarChart",
  },
  "fato_estoque_familia|agregacaoCategorica|": {
    id: "estoque.valor_familia",
    rotulo: "Valor por familia",
    descricao: "Valor de estoque por familia",
    pergunta: "Quais familias concentram valor?",
    formato: "brl",
    chartPreferido: "BarChart",
  },
  "fato_estoque_top_movimentados|agregacaoCategorica|": {
    id: "estoque.top_movimentados",
    rotulo: "Produtos mais movimentados",
    descricao: "Unidades movimentadas por produto",
    pergunta: "O que mais se movimenta?",
    formato: "contagem",
    chartPreferido: "BarChart",
  },
  // --- parados ---
  "fato_estoque_parados|kpis|totalParados": {
    id: "estoque.itens_parados",
    rotulo: "Itens parados",
    descricao: "Itens sem movimento no periodo",
    pergunta: "Quantos itens estao parados?",
    formato: "contagem",
    chartPreferido: "KPIRow",
  },
  "fato_estoque_parados|kpis|valorImobilizado": {
    id: "estoque.valor_imobilizado",
    rotulo: "Valor imobilizado",
    descricao: "Valor preso em itens parados",
    pergunta: "Quanto valor esta imobilizado?",
    formato: "brl",
    chartPreferido: "KPIRow",
  },
  "fato_estoque_parados|tabela|": {
    id: "estoque.parados_detalhe",
    rotulo: "Itens parados (detalhe)",
    descricao: "Itens parados por armazem e dias",
    pergunta: "Quais itens estao parados?",
    formato: "brl",
    chartPreferido: "DataTable",
  },
  // --- movimento (temporal) ---
  "fato_estoque_movimento|serieTemporal|": {
    id: "estoque.movimento",
    rotulo: "Movimentacao mensal",
    descricao: "Entradas e saidas por mes",
    pergunta: "Como o estoque se movimenta no tempo?",
    formato: "contagem",
    chartPreferido: "LineChart",
  },
  // --- FINANCEIRO (onda 2) ---
  "fato_financeiro_saldo|kpis|saldoTotal": {
    id: "financeiro.saldo_total",
    rotulo: "Saldo em conta",
    descricao: "Saldo somado das contas bancarias",
    pergunta: "Quanto tem em caixa/banco hoje?",
    formato: "brl",
    chartPreferido: "KPIRow",
  },
  "fato_financeiro_saldo|agregacaoCategorica|": {
    id: "financeiro.saldo_por_banco",
    rotulo: "Saldo por banco",
    descricao: "Saldo de cada conta bancaria",
    pergunta: "Onde esta o dinheiro?",
    formato: "brl",
    chartPreferido: "BarChart",
  },
  "fato_financeiro_saldo|tabela|": {
    id: "financeiro.contas",
    rotulo: "Contas bancarias",
    descricao: "Saldo por conta e tipo",
    pergunta: "Quais sao as contas e seus saldos?",
    formato: "brl",
    chartPreferido: "DataTable",
  },
  "fato_financeiro_movimento|kpis|entrada": {
    id: "financeiro.entradas",
    rotulo: "Entradas",
    descricao: "Total de entradas no periodo",
    pergunta: "Quanto entrou de dinheiro?",
    formato: "brl",
    chartPreferido: "KPIRow",
  },
  "fato_financeiro_movimento|kpis|saida": {
    id: "financeiro.saidas",
    rotulo: "Saidas",
    descricao: "Total de saidas no periodo",
    pergunta: "Quanto saiu de dinheiro?",
    formato: "brl",
    chartPreferido: "KPIRow",
  },
  "fato_financeiro_movimento|kpis|saldo": {
    id: "financeiro.caixa_liquido",
    rotulo: "Caixa liquido",
    descricao: "Entradas menos saidas no periodo",
    pergunta: "Qual o resultado de caixa do periodo?",
    formato: "brl",
    chartPreferido: "KPIRow",
  },
  "fato_financeiro_movimento|serieTemporal|": {
    id: "financeiro.fluxo_caixa",
    rotulo: "Fluxo de caixa",
    descricao: "Realizado e previsto por mes",
    pergunta: "Como o caixa evolui no tempo?",
    formato: "brl",
    chartPreferido: "Combo",
  },
  "fato_financeiro_resultado|kpis|totalReceita": {
    id: "financeiro.receita",
    rotulo: "Receita",
    descricao: "Receita gerencial no periodo",
    pergunta: "Quanto faturou (gerencial)?",
    formato: "brl",
    chartPreferido: "KPIRow",
  },
  "fato_financeiro_resultado|kpis|totalDespesa": {
    id: "financeiro.despesa",
    rotulo: "Despesa",
    descricao: "Despesa gerencial no periodo",
    pergunta: "Quanto gastou (gerencial)?",
    formato: "brl",
    chartPreferido: "KPIRow",
  },
  "fato_financeiro_resultado|kpis|resultado": {
    id: "financeiro.resultado",
    rotulo: "Resultado",
    descricao: "Receita menos despesa (gerencial)",
    pergunta: "Qual o resultado gerencial?",
    formato: "brl",
    chartPreferido: "KPIRow",
  },
  "fato_financeiro_resultado|agregacaoCategorica|": {
    id: "financeiro.resultado_por_conta",
    rotulo: "Resultado por conta",
    descricao: "Valor por conta gerencial (DRE)",
    pergunta: "Onde estao as maiores receitas/despesas?",
    formato: "brl",
    chartPreferido: "BarChart",
  },
  "fato_financeiro_resultado|cascata|": {
    id: "financeiro.dre",
    rotulo: "DRE em cascata",
    descricao: "Da receita ao resultado, passo a passo",
    pergunta: "Como a receita vira resultado?",
    formato: "brl",
    chartPreferido: "Waterfall",
  },
  // --- COMERCIAL (onda 3) ---
  "fato_comercial_pedido|kpis|totalPedidos": {
    id: "comercial.pedidos",
    rotulo: "Pedidos",
    descricao: "Quantidade de pedidos no periodo",
    pergunta: "Quantos pedidos sairam?",
    formato: "contagem",
    chartPreferido: "KPIRow",
  },
  "fato_comercial_pedido|kpis|valorTotal": {
    id: "comercial.valor_pedidos",
    rotulo: "Valor em pedidos",
    descricao: "Valor total dos pedidos no periodo",
    pergunta: "Quanto foi vendido em pedidos?",
    formato: "brl",
    chartPreferido: "KPIRow",
  },
  "fato_comercial_pedido|tabela|": {
    id: "comercial.pedidos_atrasados",
    rotulo: "Pedidos atrasados",
    descricao: "Pedidos vencidos por cliente",
    pergunta: "Quais pedidos estao atrasados?",
    formato: "brl",
    chartPreferido: "DataTable",
  },
  "fato_comercial_etapa|agregacaoCategorica|": {
    id: "comercial.por_etapa",
    rotulo: "Pedidos por etapa",
    descricao: "Valor por etapa do funil",
    pergunta: "Onde os pedidos estao parados no funil?",
    formato: "brl",
    chartPreferido: "Funnel",
  },
  "fato_comercial_vendedor|agregacaoCategorica|": {
    id: "comercial.por_vendedor",
    rotulo: "Pedidos por vendedor",
    descricao: "Valor por vendedor",
    pergunta: "Quem vende mais?",
    formato: "brl",
    chartPreferido: "BarChart",
  },
  // --- FISCAL (onda 4) ---
  "fato_fiscal_faturamento|kpis|totalNotas": {
    id: "fiscal.notas",
    rotulo: "Notas emitidas",
    descricao: "Quantidade de NF de saida no periodo",
    pergunta: "Quantas notas foram emitidas?",
    formato: "contagem",
    chartPreferido: "KPIRow",
  },
  "fato_fiscal_faturamento|kpis|valorFaturado": {
    id: "fiscal.faturamento",
    rotulo: "Faturamento",
    descricao: "Valor faturado (NF de saida) no periodo",
    pergunta: "Quanto foi faturado?",
    formato: "brl",
    chartPreferido: "KPIRow",
  },
  "fato_fiscal_cliente|agregacaoCategorica|": {
    id: "fiscal.por_cliente",
    rotulo: "Faturamento por cliente",
    descricao: "Valor faturado por cliente",
    pergunta: "Quais clientes mais faturam?",
    formato: "brl",
    chartPreferido: "Treemap",
  },
  "fato_fiscal_produto|agregacaoCategorica|": {
    id: "fiscal.por_produto",
    rotulo: "Faturamento por produto",
    descricao: "Valor faturado por produto",
    pergunta: "Quais produtos mais faturam?",
    formato: "brl",
    chartPreferido: "BarChart",
  },
  // --- CADASTROS (onda 5) ---
  "fato_cadastros_parceiro|kpis|totalClientes": {
    id: "cadastros.clientes",
    rotulo: "Clientes",
    descricao: "Clientes cadastrados",
    pergunta: "Quantos clientes existem?",
    formato: "contagem",
    chartPreferido: "KPIRow",
  },
  "fato_cadastros_parceiro|kpis|totalFornecedores": {
    id: "cadastros.fornecedores",
    rotulo: "Fornecedores",
    descricao: "Fornecedores cadastrados",
    pergunta: "Quantos fornecedores existem?",
    formato: "contagem",
    chartPreferido: "KPIRow",
  },
  "fato_cadastros_parceiro|kpis|totalAtivos": {
    id: "cadastros.ativos",
    rotulo: "Ativos",
    descricao: "Parceiros ativos",
    pergunta: "Quantos parceiros estao ativos?",
    formato: "contagem",
    chartPreferido: "KPIRow",
  },
  "fato_cadastros_uf|agregacaoCategorica|": {
    id: "cadastros.por_uf",
    rotulo: "Parceiros por UF",
    descricao: "Distribuicao de parceiros por estado",
    pergunta: "Onde estao os parceiros?",
    formato: "contagem",
    chartPreferido: "BarChart",
  },
  // --- CONTABIL + FISCAL ref (listagens) ---
  "fato_contabil_plano|tabela|": {
    id: "contabil.plano_contas",
    rotulo: "Plano de contas",
    descricao: "Estrutura contabil (codigo, conta, tipo)",
    pergunta: "Como e o plano de contas?",
    formato: "contagem",
    chartPreferido: "DataTable",
  },
  "fato_fiscal_preco|tabela|": {
    id: "fiscal.tabela_precos",
    rotulo: "Tabela de precos",
    descricao: "Regras de preco por produto/tabela",
    pergunta: "Quais os precos cadastrados?",
    formato: "brl",
    chartPreferido: "DataTable",
  },
  "fato_fiscal_servico|tabela|": {
    id: "fiscal.servicos",
    rotulo: "Servicos",
    descricao: "Servicos fiscais cadastrados",
    pergunta: "Quais servicos existem?",
    formato: "contagem",
    chartPreferido: "DataTable",
  },
};

const TEMPLATES_POR_SHAPE: Record<ShapeDerivado, ReportTemplate[]> = {
  kpis: ["KPIRow"],
  tabela: ["DataTable"],
  agregacaoCategorica: ["BarChart", "PieChart", "Funnel", "Treemap"],
  serieTemporal: ["LineChart", "Combo"],
  cascata: ["Waterfall"],
  medidor: ["Gauge"],
};

/** Dimensoes = colunas categoricas (texto) que o fato oferece para recorte/agrupamento. */
function dimensoesDoContrato(c: SourceContract): string[] {
  const set = new Set<string>();
  for (const shape of ["agregacaoCategorica", "tabela"] as ShapeDerivado[]) {
    for (const campo of c.campos[shape] ?? []) {
      if (campo.tipo === "texto") set.add(campo.key);
    }
  }
  return Array.from(set);
}

export function listarMetricas(opts: { dominiosPermitidos: string[] }): Metrica[] {
  const out: Metrica[] = [];
  for (const c of listarFontes()) {
    if (!opts.dominiosPermitidos.includes(c.dominio)) continue;
    const temSerieTemporal = c.shapes.includes("serieTemporal");
    const dimensoes = dimensoesDoContrato(c);
    for (const shape of c.shapes) {
      if (shape === "kpis") {
        for (const campo of c.campos.kpis ?? []) {
          const cur = CURADORIA[`${c.fato}|kpis|${campo.key}`];
          if (cur) out.push(montar(c, shape, campo.key, cur, dimensoes, temSerieTemporal));
        }
      } else {
        const cur = CURADORIA[`${c.fato}|${shape}|`];
        if (cur) out.push(montar(c, shape, undefined, cur, dimensoes, temSerieTemporal));
      }
    }
  }
  return out;
}

function montar(
  c: SourceContract,
  shape: ShapeDerivado,
  campoKpi: string | undefined,
  cur: Curada,
  dimensoes: string[],
  temSerieTemporal: boolean,
): Metrica {
  return {
    id: cur.id,
    dominio: c.dominio,
    fato: c.fato,
    shape,
    campoKpi,
    rotulo: cur.rotulo,
    descricao: cur.descricao,
    pergunta: cur.pergunta,
    formato: cur.formato,
    dimensoes,
    temSerieTemporal,
    chartPreferido: cur.chartPreferido,
    chartsValidos: TEMPLATES_POR_SHAPE[shape],
  };
}

/** Acha uma metrica pelo id (helper para build/amostra/template). */
export function obterMetrica(metricas: Metrica[], id: string): Metrica | undefined {
  return metricas.find((m) => m.id === id);
}

/** Dominios distintos que o registry conhece (default de RBAC quando nao filtrado). */
export function dominiosRegistrados(): string[] {
  return [...new Set(listarFontes().map((c) => c.dominio))];
}
