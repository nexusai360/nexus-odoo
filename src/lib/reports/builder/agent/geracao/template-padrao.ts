// src/lib/reports/builder/agent/geracao/template-padrao.ts
// Template DETERMINISTICO por dominio: o destino do atalho "gerar ja" (0 LLM). Um Plano
// coerente por construcao (passa o revisor sem ajuste), para quem pula a entrevista. O
// LLM so entra no refino opcional depois.
import { obterMetrica } from "./metric-catalog";
import type { Metrica } from "./metric-catalog";
import type { Plano, Bloco } from "./plano-types";

export function templatePadrao(dominio: string, metricas: Metrica[]): Plano {
  if (dominio === "estoque") return planoEstoque(metricas);
  // Onda 1: so estoque. Outros dominios entram em ondas futuras (so registrar metricas).
  return { titulo: "Relatorio", objetivo: "", dominio, blocos: [], filtrosIniciais: {} };
}

function planoEstoque(metricas: Metrica[]): Plano {
  const blocos: Bloco[] = [
    { tipo: "KpiStrip", metricas: ["estoque.valor_total", "estoque.produtos", "estoque.negativos"] },
    { tipo: "Ranking", metrica: "estoque.valor_armazem", recorte: "armazem" },
    { tipo: "Tabela", metrica: "estoque.saldo_produto" },
  ];
  return {
    titulo: "Panorama do estoque",
    objetivo: "Visao geral do estoque: saude, concentracao por armazem e detalhe por produto",
    dominio: "estoque",
    blocos: blocos.filter((b) => blocoTemMetricasValidas(b, metricas)),
    filtrosIniciais: {},
  };
}

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
