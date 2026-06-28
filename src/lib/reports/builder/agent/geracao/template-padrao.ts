// src/lib/reports/builder/agent/geracao/template-padrao.ts
// Template DETERMINISTICO por dominio: o destino do atalho "gerar ja" (0 LLM). Um Plano
// coerente por construcao (passa o revisor sem ajuste), para quem pula a entrevista. O
// LLM so entra no refino opcional depois.
import { obterMetrica } from "./metric-catalog";
import type { Metrica } from "./metric-catalog";
import type { Plano, Bloco } from "./plano-types";

export function templatePadrao(dominio: string, metricas: Metrica[]): Plano {
  const fabrica = TEMPLATES_POR_DOMINIO[dominio];
  if (fabrica) return fabrica(metricas);
  // Dominio sem template dedicado: plano vazio (o gerar-ja so vale onde ha template).
  return { titulo: "Relatorio", objetivo: "", dominio, blocos: [], filtrosIniciais: {} };
}

/** Monta um Plano filtrando blocos cujas metricas nao existem no catalogo permitido. */
function montarPlano(
  base: Omit<Plano, "blocos" | "filtrosIniciais"> & { blocos: Bloco[] },
  metricas: Metrica[],
): Plano {
  return {
    ...base,
    blocos: base.blocos.filter((b) => blocoTemMetricasValidas(b, metricas)),
    filtrosIniciais: {},
  };
}

// Um template por dominio: arco panorama -> analise -> detalhe, ja coerente
// (passa o revisor sem ajuste), exibindo os componentes proprios de cada area.
const TEMPLATES_POR_DOMINIO: Record<string, (m: Metrica[]) => Plano> = {
  estoque: (m) =>
    montarPlano(
      {
        titulo: "Panorama do estoque",
        objetivo: "Visao geral do estoque: saude, concentracao por armazem e detalhe por produto",
        dominio: "estoque",
        blocos: [
          { tipo: "KpiStrip", metricas: ["estoque.valor_total", "estoque.produtos", "estoque.negativos"] },
          { tipo: "Ranking", metrica: "estoque.valor_armazem", recorte: "armazem" },
          { tipo: "Tabela", metrica: "estoque.saldo_produto" },
        ],
      },
      m,
    ),
  // Financeiro: KPIs de caixa + fluxo (Combo) ao lado da composicao por banco +
  // DRE em cascata (Waterfall) + contas (tabela).
  financeiro: (m) =>
    montarPlano(
      {
        titulo: "Panorama financeiro",
        objetivo: "Caixa do periodo, evolucao realizada x prevista, resultado e contas",
        dominio: "financeiro",
        blocos: [
          { tipo: "KpiStrip", metricas: ["financeiro.entradas", "financeiro.saidas", "financeiro.caixa_liquido"] },
          { tipo: "TendenciaDistribuicao", metricaSerie: "financeiro.fluxo_caixa", metricaComposicao: "financeiro.saldo_por_banco" },
          { tipo: "Cascata", metrica: "financeiro.dre" },
          { tipo: "Tabela", metrica: "financeiro.contas" },
        ],
      },
      m,
    ),
  // Comercial: KPIs de pedidos + funil por etapa (Funnel) + atrasados (tabela).
  comercial: (m) =>
    montarPlano(
      {
        titulo: "Panorama comercial",
        objetivo: "Pedidos do periodo, funil por etapa e pedidos atrasados",
        dominio: "comercial",
        blocos: [
          { tipo: "KpiStrip", metricas: ["comercial.pedidos", "comercial.valor_pedidos"] },
          { tipo: "Ranking", metrica: "comercial.por_etapa", recorte: "etapa" },
          { tipo: "Tabela", metrica: "comercial.pedidos_atrasados" },
        ],
      },
      m,
    ),
  // Fiscal: KPIs de faturamento + concentracao por cliente (Treemap) + tabela de precos.
  fiscal: (m) =>
    montarPlano(
      {
        titulo: "Panorama fiscal",
        objetivo: "Faturamento do periodo, concentracao por cliente e tabela de precos",
        dominio: "fiscal",
        blocos: [
          { tipo: "KpiStrip", metricas: ["fiscal.notas", "fiscal.faturamento"] },
          { tipo: "Ranking", metrica: "fiscal.por_cliente", recorte: "cliente" },
          { tipo: "Tabela", metrica: "fiscal.tabela_precos" },
        ],
      },
      m,
    ),
};

function blocoTemMetricasValidas(bloco: Bloco, metricas: Metrica[]): boolean {
  switch (bloco.tipo) {
    case "KpiStrip":
      return bloco.metricas.every((id) => obterMetrica(metricas, id));
    case "Ranking":
    case "Tabela":
    case "Cascata":
      return !!obterMetrica(metricas, bloco.metrica);
    case "TendenciaDistribuicao":
      return !!obterMetrica(metricas, bloco.metricaSerie) && !!obterMetrica(metricas, bloco.metricaComposicao);
  }
}
