// src/lib/reports/builder/agent/geracao/amostra.ts
// Resolvedor de AMOSTRA leve: alimenta o critico e o revisor com o MINIMO que eles
// precisam para julgar/decidir, sem materializar o relatorio inteiro. Por metrica:
// escalar (do campoKpi certo), cardinalidade + topN (categorica) e nPontosSerie (serie).
// O dado pesado fica para a resolucao final no render.
import type { Metrica } from "./metric-catalog";

export interface AmostraMetrica {
  metricaId: string;
  escalar?: number;
  cardinalidade?: number;
  topN?: { rotulo: string; valor: number }[];
  nPontosSerie?: number;
}

export interface AmostraDeps {
  resolver: (
    fato: string,
    shape: string,
  ) => Promise<{ linhas: Record<string, unknown>[]; kpis?: Record<string, number> }>;
}

export async function resolverAmostra(
  metricas: Metrica[],
  deps: AmostraDeps,
): Promise<AmostraMetrica[]> {
  const cache = new Map<string, { linhas: Record<string, unknown>[]; kpis?: Record<string, number> }>();
  const out: AmostraMetrica[] = [];

  for (const m of metricas) {
    const chave = `${m.fato}|${m.shape}`;
    let raw = cache.get(chave);
    if (!raw) {
      raw = await deps.resolver(m.fato, m.shape);
      cache.set(chave, raw);
    }
    out.push(amostraDe(m, raw));
  }
  return out;
}

function amostraDe(
  m: Metrica,
  raw: { linhas: Record<string, unknown>[]; kpis?: Record<string, number> },
): AmostraMetrica {
  const base: AmostraMetrica = { metricaId: m.id };
  if (m.shape === "kpis") {
    base.escalar = m.campoKpi ? raw.kpis?.[m.campoKpi] : undefined;
  } else if (m.shape === "agregacaoCategorica") {
    base.cardinalidade = raw.linhas.length;
    base.topN = raw.linhas
      .map((l) => ({ rotulo: String(l.rotulo ?? ""), valor: Number(l.valor ?? 0) }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5);
  } else if (m.shape === "serieTemporal") {
    base.nPontosSerie = raw.linhas.length;
  }
  return base;
}
