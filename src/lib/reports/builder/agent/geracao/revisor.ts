// src/lib/reports/builder/agent/geracao/revisor.ts
// REVISOR DETERMINISTICO: a rede final que GARANTE as invariantes da gramatica antes do
// build, resolvendo valores quando preciso. E o que torna o Frankenstein impossivel, sem
// gastar token. Substitui o curar-blueprint fraco (que dedupava por assinatura com
// recorte e deixava passar as 4 barras iguais).
import type { Plano, Bloco, BlocoRanking, BlocoKpi, PapelBloco } from "./plano-types";
import { papelDoBloco } from "./plano-types";
import type { Metrica } from "./metric-catalog";
import { obterMetrica } from "./metric-catalog";
import type { AmostraMetrica } from "./amostra";

export interface AjusteRevisor {
  regra: string;
  acao: string;
}
export interface ResultadoRevisor {
  plano: Plano;
  ajustes: AjusteRevisor[];
}

const ORDEM_PAPEL: Record<PapelBloco, number> = { panorama: 0, analise: 1, detalhe: 2 };
const TETO_TOTAL = 5;
const TOLERANCIA_VALOR = 1e-6;

export function revisarPlano(
  plano: Plano,
  ctx: { metricas: Metrica[]; amostra: AmostraMetrica[] },
): ResultadoRevisor {
  const ajustes: AjusteRevisor[] = [];
  const amostraDe = (id: string) => ctx.amostra.find((a) => a.metricaId === id);
  let blocos = [...plano.blocos];

  // 1. Transforms por bloco: degradar tendencia sem serie e rebaixar donut com >6 cats.
  blocos = blocos.map((b): Bloco => {
    if (b.tipo !== "TendenciaDistribuicao") return b;
    const serie = amostraDe(b.metricaSerie);
    if (serie?.nPontosSerie !== undefined && serie.nPontosSerie < 4) {
      ajustes.push({
        regra: "serie_curta_degrada",
        acao: `serie ${b.metricaSerie} com ${serie.nPontosSerie} pontos (<4): bloco temporal vira ranking de ${b.metricaComposicao}`,
      });
      return rankingDe(b.metricaComposicao, ctx.metricas);
    }
    const comp = amostraDe(b.metricaComposicao);
    if (comp?.cardinalidade !== undefined && comp.cardinalidade > 6) {
      ajustes.push({
        regra: "donut_acima_de_6",
        acao: `composicao ${b.metricaComposicao} com ${comp.cardinalidade} categorias (>6): donut vira ranking`,
      });
      return rankingDe(b.metricaComposicao, ctx.metricas);
    }
    return b;
  });

  // 2. No maximo 1 KpiStrip.
  let kpiVisto = false;
  blocos = blocos.filter((b) => {
    if (b.tipo !== "KpiStrip") return true;
    if (kpiVisto) {
      ajustes.push({ regra: "kpi_unico", acao: "removida tira de KPIs extra (so 1 por relatorio)" });
      return false;
    }
    kpiVisto = true;
    return true;
  });

  // 3. Dedup de KPI por VALOR resolvido colidente + identidade (correcao critica da review).
  blocos = blocos.map((b) => (b.tipo === "KpiStrip" ? deduparKpis(b, ctx.amostra, ajustes) : b));

  // 4. Teto por PAPEL (ignora recorte): no maximo 1 Ranking e 1 TendenciaDistribuicao.
  let rankVisto = false;
  let tendVista = false;
  blocos = blocos.filter((b) => {
    if (b.tipo === "Ranking") {
      if (rankVisto) {
        ajustes.push({ regra: "teto_por_papel", acao: "removido ranking redundante (max 1 por relatorio)" });
        return false;
      }
      rankVisto = true;
    }
    if (b.tipo === "TendenciaDistribuicao") {
      if (tendVista) {
        ajustes.push({ regra: "teto_por_papel", acao: "removido bloco de tendencia redundante" });
        return false;
      }
      tendVista = true;
    }
    return true;
  });

  // 5. Teto total de blocos.
  if (blocos.length > TETO_TOTAL) {
    ajustes.push({ regra: "teto_total", acao: `cortado para ${TETO_TOTAL} blocos` });
    blocos = blocos.slice(0, TETO_TOTAL);
  }

  // 6. Ordena no arco narrativo (estavel).
  blocos = blocos
    .map((b, i) => ({ b, i, ord: ORDEM_PAPEL[papelDoBloco(b)] }))
    .sort((a, z) => a.ord - z.ord || a.i - z.i)
    .map((x) => x.b);

  return { plano: { ...plano, blocos }, ajustes };
}

function rankingDe(metricaId: string, metricas: Metrica[]): BlocoRanking {
  const m = obterMetrica(metricas, metricaId);
  return { tipo: "Ranking", metrica: metricaId, recorte: m?.dimensoes[0] ?? "geral" };
}

function deduparKpis(
  bloco: BlocoKpi,
  amostra: AmostraMetrica[],
  ajustes: AjusteRevisor[],
): BlocoKpi {
  const vistos: { id: string; valor?: number }[] = [];
  const mantidas: string[] = [];
  for (const id of bloco.metricas) {
    const valor = amostra.find((a) => a.metricaId === id)?.escalar;
    const colide = vistos.some(
      (v) =>
        v.id === id ||
        (v.valor !== undefined &&
          valor !== undefined &&
          Math.abs(v.valor - valor) <= Math.max(TOLERANCIA_VALOR, Math.abs(v.valor) * TOLERANCIA_VALOR)),
    );
    if (colide) {
      ajustes.push({ regra: "kpi_valor_colidente", acao: `KPI ${id} removido (valor/identidade colidente)` });
      continue;
    }
    vistos.push({ id, valor });
    mantidas.push(id);
  }
  return { ...bloco, metricas: mantidas };
}
