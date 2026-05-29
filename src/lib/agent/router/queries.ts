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
  ROUTER_PROMOTION_MIN_COVERAGE_PCT,
  ROUTER_PROMOTION_MIN_DECISIONS,
} from "@/lib/agent/router/constants";

const IN_FLIGHT_WINDOW_SECONDS = 60;

/** KPI consolidado do router nos ultimos N dias. */
export type RouterKpis = {
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
/** Filtro do painel do router: range de datas (casa com PeriodPills, inclusive
 *  "Personalizado") + modos opcionais (multi-select de origem). */
export type RouterFilter = {
  start: Date;
  end: Date;
  modes?: string[];
  /** Busca livre na pergunta (so aplicada na tabela de decisoes). */
  q?: string;
  /** Filtra por dominios chamados/esperados (toolsDomains hasSome). */
  tools?: string[];
  /** Filtra por dominios escolhidos pelo router (pickedDomains hasSome). */
  picked?: string[];
};

/** Range default: ultimos 7 dias ate agora. */
export function defaultRouterFilter(): RouterFilter {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

function buildBaseWhere(filter: RouterFilter) {
  const where: {
    createdAt: { gte: Date; lte: Date };
    mode?: { in: string[] };
  } = {
    createdAt: { gte: filter.start, lte: filter.end },
  };
  if (filter.modes && filter.modes.length > 0) {
    where.mode = { in: filter.modes };
  }
  return where;
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
export async function getRouterKpis(filter: RouterFilter): Promise<RouterKpis> {
  const baseWhere = buildBaseWhere(filter);

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
  filter: RouterFilter,
): Promise<RouterHistogramBucket[]> {
  // Excecao §0 do PLAN v3: width_bucket nao e' mapeado pelo Prisma client.
  // Filtro de modo: quando informado usa-os; senao todos os modos relevantes
  // (inclui calibracao para o painel ter dado mesmo sem trafego de producao).
  const modeList =
    filter.modes && filter.modes.length > 0
      ? filter.modes
      : ["shadow", "active", "calibracao"];
  const raw = await prisma.$queryRawUnsafe<
    Array<{ bucket: number; qty: number | bigint }>
  >(
    `
    SELECT width_bucket(top_score::float, 0, 1, 10) AS bucket,
           count(*) AS qty
    FROM agent_router_decision
    WHERE mode = ANY($3::text[])
      AND created_at >= $1::timestamp
      AND created_at <= $2::timestamp
      AND top_score IS NOT NULL
    GROUP BY bucket
    ORDER BY bucket;
    `,
    filter.start.toISOString(),
    filter.end.toISOString(),
    modeList,
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
  filter: RouterFilter,
  limit = 50,
): Promise<RouterDiscordanciaRow[]> {
  const rows = await prisma.agentRouterDecision.findMany({
    where: {
      ...buildBaseWhere(filter),
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
  filter: RouterFilter,
): Promise<RouterLatencyPoint[]> {
  const rows = await prisma.agentRouterDecision.findMany({
    where: {
      ...buildBaseWhere(filter),
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

/** Linha da tabela de TODAS as decisoes do router (nao so discordancias). */
export type RouterDecisionRow = {
  id: string;
  createdAt: Date;
  userQuestion: string;
  pickedDomains: string[];
  toolsActuallyUsed: string[];
  toolsDomains: string[];
  topScore: number | null;
  fallbackTriggered: boolean;
  mode: string;
  /** true quando nenhum dominio chamado/esperado esta entre os escolhidos. */
  discordante: boolean;
  /** R2-ctx: a Camada 2 (LLM) reformulou a pergunta neste turno. */
  usedReformulation: boolean;
  /** R2-ctx: pergunta reformulada (null se nao houve reformulacao). */
  reformulatedQuestion: string | null;
  /** R2-ctx: a Camada 1 (embedding cru) caiu em fallback. */
  originalFallback: boolean;
};

export type RouterDecisionsPage = {
  rows: RouterDecisionRow[];
  total: number;
};

/** Data da primeira decisao registrada (para minDate do PeriodPills/"Tudo"). */
export async function getRouterEarliestDecision(): Promise<Date | null> {
  const row = await prisma.agentRouterDecision.findFirst({
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  return row?.createdAt ?? null;
}

/** Tabela paginada de todas as decisoes do router no filtro (D2c v2). */
export async function getRouterDecisions(
  filter: RouterFilter,
  page = 0,
  pageSize = 50,
): Promise<RouterDecisionsPage> {
  const where: ReturnType<typeof buildBaseWhere> & {
    userQuestion?: { contains: string; mode: "insensitive" };
    toolsDomains?: { hasSome: string[] };
    pickedDomains?: { hasSome: string[] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    OR?: any[];
  } = buildBaseWhere(filter);
  if (filter.q && filter.q.trim()) {
    // Busca avancada/global: pergunta + modo + dominios (escolhidos e chamados)
    // cujo nome/rotulo casa com o termo.
    const q = filter.q.trim();
    const ql = q.toLowerCase();
    const LABELS: Record<string, string> = {
      caminho3: "bi avançado",
      "dominios-vazios": "cobertura",
    };
    const ALL = [
      "estoque",
      "financeiro",
      "fiscal",
      "comercial",
      "cadastros",
      "contabil",
      "crm",
      "caminho3",
      "dominios-vazios",
    ];
    const candidates = ALL.filter(
      (d) => d.includes(ql) || (LABELS[d] ?? "").includes(ql),
    );
    where.OR = [
      { userQuestion: { contains: q, mode: "insensitive" } },
      { mode: { contains: q, mode: "insensitive" } },
      ...(candidates.length > 0
        ? [
            { pickedDomains: { hasSome: candidates } },
            { toolsDomains: { hasSome: candidates } },
          ]
        : []),
    ];
  }
  if (filter.tools && filter.tools.length > 0) {
    where.toolsDomains = { hasSome: filter.tools };
  }
  if (filter.picked && filter.picked.length > 0) {
    where.pickedDomains = { hasSome: filter.picked };
  }
  const [rows, total] = await Promise.all([
    prisma.agentRouterDecision.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        userQuestion: true,
        pickedDomains: true,
        toolsActuallyUsed: true,
        toolsDomains: true,
        topScore: true,
        fallbackTriggered: true,
        mode: true,
        usedReformulation: true,
        reformulatedQuestion: true,
        originalFallback: true,
      },
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip: page * pageSize,
    }),
    prisma.agentRouterDecision.count({ where }),
  ]);

  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      userQuestion: r.userQuestion,
      pickedDomains: r.pickedDomains,
      toolsActuallyUsed: r.toolsActuallyUsed,
      toolsDomains: r.toolsDomains,
      topScore: r.topScore,
      fallbackTriggered: r.fallbackTriggered,
      mode: r.mode,
      usedReformulation: r.usedReformulation,
      reformulatedQuestion: r.reformulatedQuestion,
      originalFallback: r.originalFallback,
      // Discordante so faz sentido quando ha dominio esperado/chamado.
      discordante:
        r.toolsDomains.length > 0 &&
        !r.toolsDomains.some((d) => r.pickedDomains.includes(d)),
    })),
  };
}

/** D2e: o router pode ser ativado com seguranca? Gate da SPEC v3 §10.1.6
 *  (meta elevada para 95% por decisao do usuario, 2026-05-28).
 *  Metrica: cobertura Top-K (allInTopKPct) = % de turnos onde TODAS as tools
 *  usadas estavam em algum dominio entregue ao LLM. E' o que de fato importa,
 *  inclusive em perguntas multi-dominio: a IA so responde certo se recebeu as
 *  ferramentas de todos os dominios que a pergunta tocou.
 *  - allInTopKPct >= 95% nos ultimos 7 dias, com >= 200 decisoes. */
export async function getRouterEligibleToActivate(): Promise<RouterEligibility> {
  // O gate olha sempre os ultimos 7 dias, independente do filtro do painel.
  const kpis = await getRouterKpis(defaultRouterFilter());
  if (kpis.totalDecisoes === 0) {
    return {
      eligible: false,
      reason:
        "Nenhuma decisao registrada. Mantenha o router em shadow ate acumular dado.",
    };
  }
  if (kpis.totalDecisoes < ROUTER_PROMOTION_MIN_DECISIONS) {
    return {
      eligible: kpis.allInTopKPct >= ROUTER_PROMOTION_MIN_COVERAGE_PCT,
      reason: `${kpis.totalDecisoes} decisoes (< ${ROUTER_PROMOTION_MIN_DECISIONS}). Cobertura Top-K atual ${kpis.allInTopKPct}%. Recomendado: ${ROUTER_PROMOTION_MIN_DECISIONS}+ decisoes com cobertura >= ${ROUTER_PROMOTION_MIN_COVERAGE_PCT}%.`,
    };
  }
  if (kpis.allInTopKPct < ROUTER_PROMOTION_MIN_COVERAGE_PCT) {
    return {
      eligible: false,
      reason: `Cobertura Top-K ${kpis.allInTopKPct}% < ${ROUTER_PROMOTION_MIN_COVERAGE_PCT}%. Ajustar domain-vocabulary.ts e re-validar antes de ativar.`,
    };
  }
  return {
    eligible: true,
    reason: `Cobertura Top-K ${kpis.allInTopKPct}% com ${kpis.totalDecisoes} decisoes nos ultimos 7 dias. Apto para ativacao.`,
  };
}
