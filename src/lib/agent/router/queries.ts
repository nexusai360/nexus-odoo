// R1 router de catalogo: queries server-side para o painel admin.
//
// Spec: docs/superpowers/specs/2026-05-28-router-catalogo-design.md §10.
// Plan: docs/superpowers/plans/2026-05-28-router-catalogo-plan.md §D2.
//
// Convencao (errata SPEC v3.1 + decisao PLAN v3 §0):
//  - Default: Prisma client (type-safe, autocompletar).
//  - $queryRaw: SOMENTE para queries que dependem de funcao Postgres nao
//    mapeada pelo Prisma (caso unico: width_bucket em getRouterHistogram).
//
// Todas as queries filtram out rows "em flight" (toolsActuallyUsed vazio E
// createdAt < now - 60s) para evitar inflar denominadores com turnos
// incompletos.

import { prisma } from "@/lib/prisma";
import {
  ROUTER_PROMOTION_MIN_TOP1_PCT,
  ROUTER_PROMOTION_MIN_DECISIONS,
} from "@/lib/agent/router/constants";

const IN_FLIGHT_WINDOW_SECONDS = 60;

/** KPI consolidado do router nos ultimos N dias. */
export type RouterKpis = {
  periodoDias: number;
  totalDecisoes: number;
  /** Top-1 acerto: % de turnos onde o dominio top-1 do router foi de fato
   *  chamado por alguma das tools usadas. */
  top1AccPct: number;
  /** Top-K acerto (mais restrito): % onde TODAS as tools usadas estavam em
   *  algum dominio de pickedDomains. */
  allInTopKPct: number;
  /** Quantos turnos cairam em fallback (catalogo entregue inteiro). */
  fallbackCount: number;
  fallbackPct: number;
  /** Distribuicao de modos: { shadow: N, active: M, ... }. */
  modeBreakdown: Record<string, number>;
  /** Latencia (ms) do pickDomains em p50, p95, p99. */
  latencyP50Ms: number;
  latencyP95Ms: number;
  latencyP99Ms: number;
};

/** Bucket do histograma (0.0-0.1, 0.1-0.2, ...). */
export type RouterHistogramBucket = {
  bucketIdx: number; // 1..10 (width_bucket)
  bucketStart: number;
  bucketEnd: number;
  qty: number;
};

/** Linha de discordancia: o router escolheu dominios que NAO incluem nenhum
 *  dos dominios das tools de fato chamadas. */
export type RouterDiscordanciaRow = {
  id: string;
  createdAt: Date;
  userQuestion: string;
  pickedDomains: string[];
  toolsActuallyUsed: string[];
  toolsDomains: string[];
  topScore: number | null;
};

/** Ponto da serie temporal de latencia (1 valor por dia). */
export type RouterLatencyPoint = {
  day: string; // "YYYY-MM-DD"
  p50: number;
  p95: number;
  p99: number;
};

/** Gate de seguranca para ativacao do router. */
export type RouterEligibility = {
  eligible: boolean;
  reason: string;
};

/** Helper: cutoff para considerar uma row "completa" (toolsActuallyUsed
 *  preenchido OU createdAt mais velho que 60s). */
function buildBaseWhere(periodoDias: number) {
  return {
    createdAt: {
      gte: new Date(Date.now() - periodoDias * 24 * 60 * 60 * 1000),
    },
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.floor((p / 100) * sorted.length),
  );
  return sorted[idx] ?? 0;
}

/** D2a: KPIs globais do router para o periodo. */
export async function getRouterKpis(periodoDias = 7): Promise<RouterKpis> {
  const baseWhere = buildBaseWhere(periodoDias);

  // Rows com toolsActuallyUsed nao vazio E createdAt antigo o suficiente.
  const completedRows = await prisma.agentRouterDecision.findMany({
    where: {
      ...baseWhere,
      NOT: { toolsActuallyUsed: { isEmpty: true } },
      createdAt: {
        ...baseWhere.createdAt,
        lt: new Date(Date.now() - IN_FLIGHT_WINDOW_SECONDS * 1000),
      },
    },
    select: {
      pickedDomains: true,
      toolsDomains: true,
      fallbackTriggered: true,
      mode: true,
      pickDurationMs: true,
    },
  });

  const totalDecisoes = completedRows.length;
  let top1Hit = 0;
  let allInTopK = 0;
  let fallbackCount = 0;
  const modeBreakdown: Record<string, number> = {};
  const durations: number[] = [];

  for (const r of completedRows) {
    const top1 = r.pickedDomains[0];
    if (top1 && r.toolsDomains.includes(top1)) top1Hit += 1;
    if (
      r.toolsDomains.length > 0 &&
      r.toolsDomains.every((d) => r.pickedDomains.includes(d))
    ) {
      allInTopK += 1;
    }
    if (r.fallbackTriggered) fallbackCount += 1;
    modeBreakdown[r.mode] = (modeBreakdown[r.mode] ?? 0) + 1;
    if (r.pickDurationMs !== null && r.pickDurationMs !== undefined) {
      durations.push(r.pickDurationMs);
    }
  }

  return {
    periodoDias,
    totalDecisoes,
    top1AccPct:
      totalDecisoes > 0
        ? Number(((top1Hit / totalDecisoes) * 100).toFixed(1))
        : 0,
    allInTopKPct:
      totalDecisoes > 0
        ? Number(((allInTopK / totalDecisoes) * 100).toFixed(1))
        : 0,
    fallbackCount,
    fallbackPct:
      totalDecisoes > 0
        ? Number(((fallbackCount / totalDecisoes) * 100).toFixed(1))
        : 0,
    modeBreakdown,
    latencyP50Ms: Math.round(percentile(durations, 50)),
    latencyP95Ms: Math.round(percentile(durations, 95)),
    latencyP99Ms: Math.round(percentile(durations, 99)),
  };
}

/** D2b: histograma de topScore via width_bucket (Postgres builtin). */
export async function getRouterHistogram(
  periodoDias = 7,
): Promise<RouterHistogramBucket[]> {
  // Excecao §0 do PLAN v3: width_bucket nao e' mapeado pelo Prisma client.
  const sinceIso = new Date(
    Date.now() - periodoDias * 24 * 60 * 60 * 1000,
  ).toISOString();
  const raw = await prisma.$queryRawUnsafe<
    Array<{ bucket: number; qty: number | bigint }>
  >(
    `
    SELECT width_bucket(top_score::float, 0, 1, 10) AS bucket,
           count(*) AS qty
    FROM agent_router_decision
    WHERE mode IN ('shadow', 'active')
      AND created_at > $1::timestamp
      AND top_score IS NOT NULL
    GROUP BY bucket
    ORDER BY bucket;
    `,
    sinceIso,
  );

  // Garante 10 buckets na saida (mesmo os com qty=0).
  const buckets: RouterHistogramBucket[] = [];
  for (let i = 1; i <= 10; i++) {
    const match = raw.find((r) => Number(r.bucket) === i);
    buckets.push({
      bucketIdx: i,
      bucketStart: (i - 1) / 10,
      bucketEnd: i / 10,
      qty: match ? Number(match.qty) : 0,
    });
  }
  return buckets;
}

/** D2c: ultimas N discordancias (tools chamadas fora de pickedDomains).
 *  Candidatos a calibrar domain-vocabulary. */
export async function getRouterDiscordancias(
  limit = 50,
  periodoDias = 14,
): Promise<RouterDiscordanciaRow[]> {
  const rows = await prisma.agentRouterDecision.findMany({
    where: {
      ...buildBaseWhere(periodoDias),
      NOT: { toolsActuallyUsed: { isEmpty: true } },
    },
    select: {
      id: true,
      createdAt: true,
      userQuestion: true,
      pickedDomains: true,
      toolsActuallyUsed: true,
      toolsDomains: true,
      topScore: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit * 4, // overfetch para filtrar discordancias depois
  });

  return rows
    .filter((r) => {
      // Discordancia: nenhuma toolDomain esta em pickedDomains.
      return !r.toolsDomains.some((d) => r.pickedDomains.includes(d));
    })
    .slice(0, limit);
}

/** D2d: serie temporal de latencia p50/p95/p99 por dia. */
export async function getRouterLatencyTimeseries(
  periodoDias = 7,
): Promise<RouterLatencyPoint[]> {
  const rows = await prisma.agentRouterDecision.findMany({
    where: {
      ...buildBaseWhere(periodoDias),
      pickDurationMs: { not: null },
    },
    select: { createdAt: true, pickDurationMs: true },
  });

  const byDay = new Map<string, number[]>();
  for (const r of rows) {
    const day = r.createdAt.toISOString().slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    if (r.pickDurationMs !== null) {
      byDay.get(day)!.push(r.pickDurationMs);
    }
  }

  return Array.from(byDay.entries())
    .sort()
    .map(([day, durations]) => ({
      day,
      p50: Math.round(percentile(durations, 50)),
      p95: Math.round(percentile(durations, 95)),
      p99: Math.round(percentile(durations, 99)),
    }));
}

/** D2e: o router pode ser ativado com seguranca? Gate da SPEC v3 §10.1.6
 *  (meta elevada para 95% por decisao do usuario, 2026-05-28):
 *  - Top-1 acerto >= 95% nos ultimos 7 dias, OU
 *  - >= 200 decisoes em shadow com Top-1 >= 95%. */
export async function getRouterEligibleToActivate(): Promise<RouterEligibility> {
  const kpis = await getRouterKpis(7);
  if (kpis.totalDecisoes === 0) {
    return {
      eligible: false,
      reason:
        "Nenhuma decisao registrada. Mantenha o router em shadow ate acumular dado.",
    };
  }
  if (kpis.totalDecisoes < ROUTER_PROMOTION_MIN_DECISIONS) {
    return {
      eligible: kpis.top1AccPct >= ROUTER_PROMOTION_MIN_TOP1_PCT,
      reason: `${kpis.totalDecisoes} decisoes (< ${ROUTER_PROMOTION_MIN_DECISIONS}). Top-1 atual ${kpis.top1AccPct}%. Recomendado: ${ROUTER_PROMOTION_MIN_DECISIONS}+ decisoes com Top-1 >= ${ROUTER_PROMOTION_MIN_TOP1_PCT}%.`,
    };
  }
  if (kpis.top1AccPct < ROUTER_PROMOTION_MIN_TOP1_PCT) {
    return {
      eligible: false,
      reason: `Top-1 ${kpis.top1AccPct}% < ${ROUTER_PROMOTION_MIN_TOP1_PCT}%. Ajustar domain-vocabulary.ts e re-validar antes de ativar.`,
    };
  }
  return {
    eligible: true,
    reason: `Top-1 ${kpis.top1AccPct}% com ${kpis.totalDecisoes} decisoes nos ultimos 7 dias. Apto para ativacao.`,
  };
}
