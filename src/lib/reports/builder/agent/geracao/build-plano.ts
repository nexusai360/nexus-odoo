// src/lib/reports/builder/agent/geracao/build-plano.ts
// Build DETERMINISTICO: Plano (gramatica) -> BuilderReportEntry (ficha renderavel), via
// os mutadores existentes (criarRelatorio + adicionarSecao, que re-checam compat). O
// bloco composto TendenciaDistribuicao EXPANDE em 2 secoes irmas (LineChart + PieChart)
// com o MESMO config.grupoId , o renderer so as posiciona lado a lado. NAO cria novo
// ReportTemplate (nao toca a uniao do F3). Titulo de secao SEMPRE derivado da metrica.
import { criarRelatorio, adicionarSecao } from "../../tools/mutators";
import { obterMetrica } from "./metric-catalog";
import type { Metrica } from "./metric-catalog";
import type { Plano, Bloco } from "./plano-types";
import type { BuilderReportEntry } from "../../types";
import type { ReportTemplate } from "@/lib/reports/types";

interface SecaoSpec {
  template: ReportTemplate;
  fato: string;
  shapeDerivado: Metrica["shape"];
  config: Record<string, unknown>;
}

/** Templates que consomem agregacaoCategorica; o ranking honra o preferido da metrica. */
const TEMPLATES_CATEGORICOS: ReportTemplate[] = ["BarChart", "PieChart", "Funnel"];
function templateCategorico(preferido: ReportTemplate): ReportTemplate {
  return TEMPLATES_CATEGORICOS.includes(preferido) ? preferido : "BarChart";
}

/** Templates que consomem serieTemporal; a metade temporal honra o preferido. */
const TEMPLATES_TEMPORAIS: ReportTemplate[] = ["LineChart", "Combo"];
function templateTemporal(preferido: ReportTemplate): ReportTemplate {
  return TEMPLATES_TEMPORAIS.includes(preferido) ? preferido : "LineChart";
}

export function buildFichaDoPlano(
  plano: Plano,
  metricas: Metrica[],
): { ficha: BuilderReportEntry; omitidos: string[] } {
  let ficha = criarRelatorio({ titulo: plano.titulo, dominio: plano.dominio });
  const omitidos: string[] = [];

  let grupoSeq = 0;
  for (const bloco of plano.blocos) {
    const specs = especificarBloco(bloco, metricas, () => `grupo-${++grupoSeq}`, omitidos);
    for (const spec of specs) {
      const r = adicionarSecao(ficha, spec);
      if ("ficha" in r) ficha = r.ficha;
      else omitidos.push(`${spec.template} sobre ${spec.fato} (${r.erro})`);
    }
  }

  return { ficha, omitidos };
}

function especificarBloco(
  bloco: Bloco,
  metricas: Metrica[],
  novoGrupoId: () => string,
  omitidos: string[],
): SecaoSpec[] {
  switch (bloco.tipo) {
    case "KpiStrip":
      return [especificarKpiStrip(bloco.metricas, metricas, omitidos)].filter(
        (s): s is SecaoSpec => s !== null,
      );
    case "Ranking": {
      const m = obterMetrica(metricas, bloco.metrica);
      if (!m) {
        omitidos.push(`ranking ${bloco.metrica} (metrica fora do catalogo)`);
        return [];
      }
      return [
        {
          template: templateCategorico(m.chartPreferido),
          fato: m.fato,
          shapeDerivado: "agregacaoCategorica",
          config: { titulo: m.rotulo, recorte: bloco.recorte },
        },
      ];
    }
    case "Tabela": {
      const m = obterMetrica(metricas, bloco.metrica);
      if (!m) {
        omitidos.push(`tabela ${bloco.metrica} (metrica fora do catalogo)`);
        return [];
      }
      return [{ template: "DataTable", fato: m.fato, shapeDerivado: "tabela", config: { titulo: m.rotulo } }];
    }
    case "Cascata": {
      const m = obterMetrica(metricas, bloco.metrica);
      if (!m || m.shape !== "cascata") {
        omitidos.push(`cascata ${bloco.metrica} (metrica fora do catalogo ou nao-cascata)`);
        return [];
      }
      return [{ template: "Waterfall", fato: m.fato, shapeDerivado: "cascata", config: { titulo: m.rotulo } }];
    }
    case "TendenciaDistribuicao": {
      const serie = obterMetrica(metricas, bloco.metricaSerie);
      const comp = obterMetrica(metricas, bloco.metricaComposicao);
      if (!serie || !comp) {
        omitidos.push(`tendencia (${bloco.metricaSerie}/${bloco.metricaComposicao} fora do catalogo)`);
        return [];
      }
      const grupoId = novoGrupoId();
      return [
        {
          template: templateTemporal(serie.chartPreferido),
          fato: serie.fato,
          shapeDerivado: "serieTemporal",
          config: { titulo: serie.rotulo, grupoId, papelGrupo: "tendencia" },
        },
        {
          template: "PieChart",
          fato: comp.fato,
          shapeDerivado: "agregacaoCategorica",
          config: { titulo: comp.rotulo, grupoId, papelGrupo: "distribuicao" },
        },
      ];
    }
  }
}

/**
 * Uma tira de KPIs vira UMA secao KPIRow do fato primario (1a metrica). KPIs de outro
 * fato na mesma tira nao sao resolviveis por uma unica secao (a resolucao e por
 * fato/shape), entao vao para omitidos , honestidade visivel, nunca salada.
 */
function especificarKpiStrip(
  ids: string[],
  metricas: Metrica[],
  omitidos: string[],
): SecaoSpec | null {
  const ms = ids
    .map((id) => obterMetrica(metricas, id))
    .filter((m): m is Metrica => !!m && m.shape === "kpis");
  if (ms.length === 0) return null;
  const fato = ms[0].fato;
  const subtitulos: Record<string, string> = {};
  const campos: string[] = [];
  for (const m of ms) {
    if (m.fato !== fato) {
      omitidos.push(`KPI ${m.id} (fato diferente do primario na mesma tira)`);
      continue;
    }
    if (m.campoKpi) {
      campos.push(m.campoKpi);
      subtitulos[m.campoKpi] = m.descricao;
    }
  }
  return {
    template: "KPIRow",
    fato,
    shapeDerivado: "kpis",
    config: { titulo: "Indicadores", campos, subtitulos },
  };
}
