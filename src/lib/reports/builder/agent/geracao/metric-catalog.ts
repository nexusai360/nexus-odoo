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
};

const TEMPLATES_POR_SHAPE: Record<ShapeDerivado, ReportTemplate[]> = {
  kpis: ["KPIRow"],
  tabela: ["DataTable"],
  agregacaoCategorica: ["BarChart", "PieChart"],
  serieTemporal: ["LineChart"],
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
