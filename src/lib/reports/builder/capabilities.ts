// src/lib/reports/builder/capabilities.ts
// Catalogo CURADO de capacidades do construtor. Fonte unica consumida pelo prompt
// da jornada (repertorio + honestidade) e pela UI (opcoes). Vai alem de derivar
// listarFontes(): cada fonte ganha rotulo amigavel, exemplos, KPIs sugeridos e
// visualizacao recomendada, curados a mao. naoSuportado lista pedidos comuns fora
// do catalogo, sempre com a linguagem "ainda nao e possivel" + caminho proximo.
import { listarFontes } from "./source-registry";
import { CORES_SELECIONAVEIS } from "@/components/charts/colors";
import type { ReportTemplate } from "@/lib/reports/types";

export interface CapabilityFonte {
  fato: string;
  rotulo: string;
  exemplos: string[];
  kpisSugeridos: string[];
  visualizacaoRecomendada: ReportTemplate[];
}

export interface NaoSuportado {
  pedido: string;
  frase: string;
  caminhoProximo: string;
}

export interface CapabilityMap {
  escopoAtual: string;
  fontes: CapabilityFonte[];
  visualizacoes: { template: ReportTemplate; quandoUsar: string; shape: string }[];
  filtros: { tipo: string; quando: string }[];
  cores: string[];
  naoSuportado: NaoSuportado[];
}

// Curadoria por fato (1 entrada por fonte do registry de estoque). O rotulo e os
// KPIs sao escritos a mao para dar repertorio ao modelo, sem ele inventar.
const CURADORIA: Record<
  string,
  { rotulo: string; exemplos: string[]; kpisSugeridos: string[]; visualizacaoRecomendada: ReportTemplate[] }
> = {
  fato_estoque_saldo: {
    rotulo: "Saldo por produto",
    exemplos: ["quanto tenho em estoque", "valor total do estoque", "produtos com saldo negativo"],
    kpisSugeridos: ["valor total em estoque", "total de produtos", "produtos negativos"],
    visualizacaoRecomendada: ["KPIRow", "BarChart", "DataTable"],
  },
  fato_estoque_armazem: {
    rotulo: "Valor por armazem",
    exemplos: ["valor de estoque por armazem", "qual armazem concentra mais valor"],
    kpisSugeridos: ["valor total", "numero de armazens"],
    visualizacaoRecomendada: ["KPIRow", "BarChart", "DataTable"],
  },
  fato_estoque_local_produto: {
    rotulo: "Onde cada produto esta",
    exemplos: ["em quais armazens esta cada produto", "distribuicao de um produto pelos locais"],
    kpisSugeridos: ["saldo por local", "valor por local"],
    visualizacaoRecomendada: ["DataTable"],
  },
  fato_estoque_marca: {
    rotulo: "Valor por marca",
    exemplos: ["valor de estoque por marca", "quanto tenho da marca Matrix"],
    kpisSugeridos: ["valor em estoque da marca", "marcas no estoque"],
    visualizacaoRecomendada: ["KPIRow", "PieChart", "BarChart", "DataTable"],
  },
  fato_estoque_familia: {
    rotulo: "Valor por familia",
    exemplos: ["valor de estoque por familia de produto", "participacao de cada familia"],
    kpisSugeridos: ["valor por familia"],
    visualizacaoRecomendada: ["PieChart", "BarChart", "DataTable"],
  },
  fato_estoque_movimento: {
    rotulo: "Entradas e saidas por mes",
    exemplos: ["evolucao de entradas e saidas", "movimentacao do estoque ao longo do tempo"],
    kpisSugeridos: ["entradas no periodo", "saidas no periodo"],
    visualizacaoRecomendada: ["LineChart", "DataTable"],
  },
  fato_estoque_parados: {
    rotulo: "Produtos parados",
    exemplos: ["itens parados ha mais de 90 dias", "valor imobilizado em produtos parados"],
    kpisSugeridos: ["valor imobilizado", "itens parados"],
    visualizacaoRecomendada: ["KPIRow", "DataTable"],
  },
  fato_estoque_top_movimentados: {
    rotulo: "Mais movimentados",
    exemplos: ["produtos mais movimentados", "top de saidas"],
    kpisSugeridos: ["produtos movimentados", "unidades movimentadas"],
    visualizacaoRecomendada: ["BarChart", "KPIRow"],
  },
};

const VISUALIZACOES: CapabilityMap["visualizacoes"] = [
  { template: "KPIRow", quandoUsar: "panorama em numeros (totais, valor, contagens) no topo", shape: "kpis" },
  { template: "BarChart", quandoUsar: "comparar categorias (valor por familia/armazem)", shape: "agregacaoCategorica" },
  { template: "PieChart", quandoUsar: "participacao entre poucas categorias (ate ~6)", shape: "agregacaoCategorica" },
  { template: "LineChart", quandoUsar: "evolucao no tempo (entradas e saidas por mes)", shape: "serieTemporal" },
  { template: "DataTable", quandoUsar: "detalhe linha a linha", shape: "tabela" },
];

const FILTROS: CapabilityMap["filtros"] = [
  { tipo: "marca", quando: "recortar por uma marca (ex.: Matrix)" },
  { tipo: "armazem", quando: "recortar por um armazem" },
  { tipo: "familia", quando: "recortar por uma familia de produto" },
  { tipo: "faixaDias", quando: "dias minimos parado (produtos parados)" },
  { tipo: "sentido", quando: "entrada ou saida (mais movimentados)" },
];

const NAO_SUPORTADO: NaoSuportado[] = [
  {
    pedido: "vendas / pedidos / faturamento",
    frase: "Isso ainda nao e possivel: hoje eu trabalho so com os dados de estoque. Vendas, pedidos e faturamento estao chegando.",
    caminhoProximo: "posso te mostrar a movimentacao (entradas e saidas) e os mais movimentados, que e o mais proximo disso no estoque.",
  },
  {
    pedido: "financeiro / contas a pagar / receber",
    frase: "Isso ainda nao e possivel: o financeiro ainda nao esta no construtor.",
    caminhoProximo: "consigo montar o valor imobilizado em estoque e o valor por armazem/marca/familia.",
  },
  {
    pedido: "grafico 3D",
    frase: "Isso ainda nao e possivel: graficos 3D ainda nao estao disponiveis.",
    caminhoProximo: "tenho barras, pizza/rosca e linha animadas, que cobrem bem comparacao, participacao e evolucao.",
  },
  {
    pedido: "exportar PDF / Excel",
    frase: "Isso ainda nao e possivel direto pelo construtor: a exportacao ainda nao esta pronta.",
    caminhoProximo: "o relatorio fica salvo e interativo na plataforma, com filtros e tabela paginada.",
  },
];

/** Monta o catalogo completo de capacidades (derivado do registry + curadoria). */
export function montarCapabilityMap(): CapabilityMap {
  const fontesRegistry = listarFontes();
  const fontes: CapabilityFonte[] = fontesRegistry
    .map((c) => {
      const cur = CURADORIA[c.fato];
      if (!cur) return null;
      return {
        fato: c.fato,
        rotulo: cur.rotulo,
        exemplos: cur.exemplos,
        kpisSugeridos: cur.kpisSugeridos,
        visualizacaoRecomendada: cur.visualizacaoRecomendada,
      };
    })
    .filter((f): f is CapabilityFonte => f !== null);

  return {
    escopoAtual:
      "Hoje monto relatorios ricos sobre o seu estoque: saldo e valor por produto, por armazem, por marca e por familia, produtos parados, movimentacao (entradas e saidas) e os mais movimentados. Vendas e financeiro estao chegando.",
    fontes,
    visualizacoes: VISUALIZACOES,
    filtros: FILTROS,
    cores: CORES_SELECIONAVEIS.map((c) => c.token),
    naoSuportado: NAO_SUPORTADO,
  };
}

/** Serializa o catalogo em markdown enxuto (ASCII) para embutir no system prompt. */
export function capabilityComoTextoPrompt(): string {
  const c = montarCapabilityMap();
  const linhasFontes = c.fontes
    .map(
      (f) =>
        `- "${f.fato}" (${f.rotulo}): responde "${f.exemplos.join('", "')}". KPIs uteis: ${f.kpisSugeridos.join(", ")}. Visual recomendado: ${f.visualizacaoRecomendada.join(", ")}.`,
    )
    .join("\n");
  const linhasVis = c.visualizacoes.map((v) => `- ${v.template}: ${v.quandoUsar} (shape ${v.shape}).`).join("\n");
  const linhasFiltros = c.filtros.map((f) => `- ${f.tipo}: ${f.quando}.`).join("\n");
  const linhasNao = c.naoSuportado.map((n) => `- ${n.pedido}: ${n.frase} (${n.caminhoProximo})`).join("\n");
  return [
    `Escopo atual: ${c.escopoAtual}`,
    `\nFontes de dado (use prever_dado para os campos exatos):\n${linhasFontes}`,
    `\nVisualizacoes:\n${linhasVis}`,
    `\nFiltros interativos:\n${linhasFiltros}`,
    `\nO que ainda nao e possivel (seja honesto, sempre "ainda nao", e ofereca o caminho proximo):\n${linhasNao}`,
  ].join("\n");
}
