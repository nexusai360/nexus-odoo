/**
 * Queries de agregação de uso de LLM , Task 5.1 da Onda 5 (F5).
 *
 * Portado e corrigido de nexus-insights/src/lib/llm/queries/usage-stats.ts.
 * Usa Prisma v7 (não pgPool). Correções dos BUGs 5, 7 e 8 da SPEC §4.6:
 *
 * BUG 5 , costBrl/costUsd: apenas rows costKnown=true entram no custo total.
 * BUG 7 , isPlayground já existe no schema (onda 1). Filtrado aqui.
 * BUG 8 , totalConversations (count Conversation) ≠ totalIterations (count LlmUsage).
 *          Rótulos explícitos e contagens separadas.
 *
 * unknownCount: número de iterações sem preço conhecido no período.
 */

import { prisma } from "@/lib/prisma";

const TZ = "America/Sao_Paulo";

// ---------------------------------------------------------------------------
// Interfaces públicas
// ---------------------------------------------------------------------------

export interface UsageSummaryV2 {
  /** Número de Conversations (threads) no período , BUG 8. */
  totalConversations: number;
  /** Número de chamadas LLM (linhas em LlmUsage) , BUG 8. */
  totalIterations: number;
  /** Custo USD total , apenas rows costKnown=true , BUG 5. */
  totalCostUsd: number;
  /** Custo BRL total , apenas rows costKnown=true , BUG 5. */
  totalCostBrl: number;
  /** Tokens de entrada total. */
  totalTokensInput: number;
  /** Tokens de saída total. */
  totalTokensOutput: number;
  /** Quantidade de iterações sem preço conhecido. */
  unknownCount: number;

  byModel: Array<{
    provider: string;
    model: string;
    costUsd: number;
    costBrl: number;
    tokensInput: number;
    tokensOutput: number;
    calls: number;
  }>;
  byProvider: Array<{
    provider: string;
    costUsd: number;
    costBrl: number;
    calls: number;
  }>;
  byDay: Array<{
    /** Data ISO (yyyy-mm-dd). */
    day: string;
    costUsd: number;
    costBrl: number;
    tokens: number;
    calls: number;
  }>;
  /** 24 buckets (h=0..23) quando range <= 24h. Undefined caso contrário. */
  byHour?: Array<{
    hour: number;
    costUsd: number;
    costBrl: number;
    calls: number;
  }>;
}

export interface UsageDetailRow {
  id: string;
  provider: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number | null;
  costBrl: number | null;
  costKnown: boolean;
  rateStale: boolean;
  usdToBrlRate: number | null;
  rateSpread: number | null;
  durationMs: number | null;
  createdAt: string;
  promptChars: number | null;
  responseChars: number | null;
  userId: string | null;
  errorMessage: string | null;
  isPlayground: boolean;
  conversationId: string | null;
  /** Tipo da requisição: texto | imagem | audio | arquivo | embedding. */
  requestKind: string;
  /** Origem explícita da chamada (router, router_calibracao). null = deriva
   *  de isPlayground (Agente Nex / Playground). */
  origin: string | null;
  /** Tokens de raciocinio internos (OpenAI/Gemini/OpenRouter). null
   *  para providers que nao expoem (ex.: Anthropic) ou modelos legados. */
  reasoningTokens: number | null;
  /** Numero de tool calls disparadas nesta iteracao. 0 = sem tool;
   *  null = linha antiga pre-instrumentacao. */
  toolCallsCount: number | null;
  /** Nomes das tools chamadas, na ordem. Vazio quando nao houve tool. */
  toolNames: string[];
}

export interface UsageDetailsTotals {
  costUsd: number;
  costBrl: number;
  tokensInput: number;
  tokensOutput: number;
  durationMsTotal: number;
  count: number;
}

export interface UsageDetailsResult {
  rows: UsageDetailRow[];
  total: number;
  totals: UsageDetailsTotals;
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toNullNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Extrai a data local (BRT) de um Date e retorna no formato yyyy-mm-dd. */
function toIsoDay(date: Date): string {
  // Usar Intl para converter para fuso BRT
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const d = parts.find((p) => p.type === "day")?.value ?? "";
  return `${y}-${m}-${d}`;
}

/** Extrai a hora local (BRT) de um Date (0..23). */
function toLocalHour(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }).formatToParts(date);
  const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  return Number.isNaN(h) || h === 24 ? 0 : h;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// getUsageStats
// ---------------------------------------------------------------------------

/**
 * Estatísticas agregadas de uso do LLM no período.
 *
 * - totalConversations: count de Conversation (não de LlmUsage) , BUG 8.
 * - totalIterations: count de LlmUsage (uma por chamada ao provider) , BUG 8.
 * - custo total: apenas rows costKnown=true , BUG 5.
 * - unknownCount: rows costKnown=false no período.
 */
export async function getUsageStats(args: {
  start: Date;
  end: Date;
  provider?: string | null;
  model?: string | null;
  isPlayground?: boolean | null;
}): Promise<UsageSummaryV2> {
  const { start, end } = args;
  const provider = args.provider && args.provider !== "" ? args.provider : undefined;
  const model = args.model && args.model !== "" ? args.model : undefined;
  const isPlayground = typeof args.isPlayground === "boolean" ? args.isPlayground : undefined;

  const hourlyMode = end.getTime() - start.getTime() <= ONE_DAY_MS + 1;

  // Where base para LlmUsage
  const usageWhere = {
    createdAt: { gte: start, lt: end },
    ...(provider !== undefined ? { provider } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(isPlayground !== undefined ? { isPlayground } : {}),
  };

  // 1. Conversas que tiveram pelo menos uma chamada que casa com o filtro
  //    (provider/model/ambiente). Antes contava Conversation.count com
  //    where so de data+canal, ignorando provider e model - por isso o KPI
  //    "Conversas" nao mexia quando o usuario filtrava por modelo. Agora
  //    fazemos groupBy em LlmUsage.conversationId e contamos os grupos:
  //    cada conversa aparece uma vez no resultado, independente do numero
  //    de iteracoes/chamadas que ela teve.
  // 2. Agregação de custo (apenas costKnown=true) , BUG 5
  // 3. groupBy model, provider, day
  // 4. Optionally: groupBy hour (range <= 24h)

  const [
    distinctConvs,
    totalIterations,
    aggregate,
    byModelRaw,
    byProviderRaw,
    byDayRaw,
    byHourRaw,
    unknownCountRaw,
  ] = await Promise.all([
    // BUG 8 + filtro do modelo: agrupa por conversationId aplicando o
    // mesmo usageWhere; resultado serve so para contar grupos distintos.
    prisma.llmUsage.groupBy({
      by: ["conversationId"],
      where: { ...usageWhere, conversationId: { not: null } },
      _count: { _all: true },
    }),

    // BUG 8: conta LlmUsage (iterações individuais)
    prisma.llmUsage.count({ where: usageWhere }),

    // BUG 5: agrega apenas costKnown=true
    prisma.llmUsage.aggregate({
      where: { ...usageWhere, costKnown: true },
      _sum: { costUsd: true, costBrl: true, tokensInput: true, tokensOutput: true },
      _count: { _all: true },
    }),

    // byModel
    prisma.llmUsage.groupBy({
      by: ["provider", "model"],
      where: usageWhere,
      _sum: { costUsd: true, costBrl: true, tokensInput: true, tokensOutput: true },
      _count: { _all: true },
      orderBy: { _sum: { costUsd: "desc" } },
    }),

    // byProvider
    prisma.llmUsage.groupBy({
      by: ["provider"],
      where: usageWhere,
      _sum: { costUsd: true, costBrl: true },
      _count: { _all: true },
      orderBy: { _sum: { costUsd: "desc" } },
    }),

    // byDay , agrupa por data UTC; toIsoDay converte para BRT no mapeamento
    prisma.llmUsage.groupBy({
      by: ["createdAt"],
      where: usageWhere,
      _sum: { costUsd: true, costBrl: true, tokensInput: true, tokensOutput: true },
      _count: { _all: true },
    }),

    // byHour: só quando range <= 24h
    hourlyMode
      ? prisma.llmUsage.findMany({
          where: usageWhere,
          select: { createdAt: true, costUsd: true, costBrl: true },
        })
      : Promise.resolve(null),

    // unknownCount
    prisma.llmUsage.count({ where: { ...usageWhere, costKnown: false } }),
  ]);

  // ---- Agrupa byDay por data BRT (dias podem cruzar meia-noite UTC) --------
  const dayMap = new Map<string, { costUsd: number; costBrl: number; tokens: number; calls: number }>();
  for (const row of byDayRaw) {
    const day = toIsoDay(row.createdAt);
    const existing = dayMap.get(day);
    const costUsd = toNum(row._sum.costUsd);
    const costBrl = toNum(row._sum.costBrl);
    const tokens = toNum(row._sum.tokensInput) + toNum(row._sum.tokensOutput);
    const calls = toNum(row._count._all);
    if (existing) {
      existing.costUsd += costUsd;
      existing.costBrl += costBrl;
      existing.tokens += tokens;
      existing.calls += calls;
    } else {
      dayMap.set(day, { costUsd, costBrl, tokens, calls });
    }
  }
  const byDay = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({ day, ...v }));

  // ---- byHour (24 buckets, indexados 0..23) --------------------------------
  let byHour: UsageSummaryV2["byHour"];
  if (hourlyMode && byHourRaw !== null) {
    byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, costUsd: 0, costBrl: 0, calls: 0 }));
    for (const row of byHourRaw as Array<{ createdAt: Date; costUsd: unknown; costBrl: unknown }>) {
      const h = toLocalHour(row.createdAt);
      if (h >= 0 && h <= 23) {
        byHour[h].costUsd += toNum(row.costUsd);
        byHour[h].costBrl += toNum(row.costBrl);
        byHour[h].calls += 1;
      }
    }
  }

  return {
    totalConversations: distinctConvs.length,
    totalIterations,
    totalCostUsd: toNum(aggregate._sum.costUsd),
    totalCostBrl: toNum(aggregate._sum.costBrl),
    totalTokensInput: toNum(aggregate._sum.tokensInput),
    totalTokensOutput: toNum(aggregate._sum.tokensOutput),
    unknownCount: unknownCountRaw,

    byModel: byModelRaw.map((r) => ({
      provider: r.provider,
      model: r.model,
      costUsd: toNum(r._sum.costUsd),
      costBrl: toNum(r._sum.costBrl),
      tokensInput: toNum(r._sum.tokensInput),
      tokensOutput: toNum(r._sum.tokensOutput),
      calls: toNum(r._count._all),
    })),

    byProvider: byProviderRaw.map((r) => ({
      provider: r.provider,
      costUsd: toNum(r._sum.costUsd),
      costBrl: toNum(r._sum.costBrl),
      calls: toNum(r._count._all),
    })),

    byDay,
    byHour,
  };
}

// ---------------------------------------------------------------------------
// getUsageDetails
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

/**
 * Lista paginada de chamadas individuais ao LLM no período.
 *
 * - costKnown e rateStale expostos para a UI exibir badges.
 * - totals calculados sobre o universo filtrado (não só a página).
 */
export async function getUsageDetails(args: {
  start: Date;
  end: Date;
  limit?: number;
  offset?: number;
  provider?: string | null;
  model?: string | null;
  isPlayground?: boolean | null;
}): Promise<UsageDetailsResult> {
  const { start, end } = args;
  const limit = Math.max(
    1,
    Math.min(MAX_LIMIT, Number.isFinite(args.limit) ? Number(args.limit) : DEFAULT_LIMIT),
  );
  const offset = Math.max(0, Number.isFinite(args.offset) ? Number(args.offset) : 0);
  const provider = args.provider && args.provider !== "" ? args.provider : undefined;
  const model = args.model && args.model !== "" ? args.model : undefined;
  const isPlayground = typeof args.isPlayground === "boolean" ? args.isPlayground : undefined;

  const where = {
    createdAt: { gte: start, lt: end },
    ...(provider !== undefined ? { provider } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(isPlayground !== undefined ? { isPlayground } : {}),
  };

  const [rows, total, totalsAgg] = await Promise.all([
    prisma.llmUsage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        provider: true,
        model: true,
        tokensInput: true,
        tokensOutput: true,
        costUsd: true,
        costBrl: true,
        costKnown: true,
        rateStale: true,
        usdToBrlRate: true,
        rateSpread: true,
        durationMs: true,
        createdAt: true,
        promptChars: true,
        responseChars: true,
        userId: true,
        errorMessage: true,
        isPlayground: true,
        conversationId: true,
        requestKind: true,
        origin: true,
        reasoningTokens: true,
        toolCallsCount: true,
        toolNames: true,
      },
    }),
    prisma.llmUsage.count({ where }),
    prisma.llmUsage.aggregate({
      where,
      _sum: {
        costUsd: true,
        costBrl: true,
        tokensInput: true,
        tokensOutput: true,
        durationMs: true,
      },
      _count: { _all: true },
    }),
  ]);

  const mappedRows: UsageDetailRow[] = rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    model: r.model,
    tokensInput: toNum(r.tokensInput),
    tokensOutput: toNum(r.tokensOutput),
    costUsd: r.costUsd === null ? null : toNum(r.costUsd),
    costBrl: r.costBrl === null ? null : toNum(r.costBrl),
    costKnown: r.costKnown,
    rateStale: r.rateStale,
    usdToBrlRate: toNullNum(r.usdToBrlRate),
    rateSpread: toNullNum(r.rateSpread),
    durationMs: r.durationMs === null ? null : toNum(r.durationMs),
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : new Date(r.createdAt).toISOString(),
    promptChars: r.promptChars === null ? null : toNum(r.promptChars),
    responseChars: r.responseChars === null ? null : toNum(r.responseChars),
    userId: r.userId ?? null,
    errorMessage: r.errorMessage ?? null,
    isPlayground: r.isPlayground,
    conversationId: r.conversationId ?? null,
    requestKind: r.requestKind ?? "texto",
    origin: r.origin ?? null,
    reasoningTokens:
      r.reasoningTokens == null ? null : toNum(r.reasoningTokens),
    toolCallsCount:
      r.toolCallsCount == null ? null : toNum(r.toolCallsCount),
    toolNames: Array.isArray(r.toolNames) ? r.toolNames : [],
  }));

  return {
    rows: mappedRows,
    total,
    totals: {
      costUsd: toNum(totalsAgg._sum.costUsd),
      costBrl: toNum(totalsAgg._sum.costBrl),
      tokensInput: toNum(totalsAgg._sum.tokensInput),
      tokensOutput: toNum(totalsAgg._sum.tokensOutput),
      durationMsTotal: toNum(totalsAgg._sum.durationMs),
      count: total,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers auxiliares para filtros da UI
// ---------------------------------------------------------------------------

/** Providers distintos com chamadas no período. */
export async function getDistinctProviders(args: {
  start: Date;
  end: Date;
}): Promise<string[]> {
  const rows = await prisma.llmUsage.groupBy({
    by: ["provider"],
    where: { createdAt: { gte: args.start, lt: args.end } },
    orderBy: { provider: "asc" },
  });
  return rows.map((r) => r.provider).filter(Boolean);
}

/** Modelos distintos no período, opcionalmente filtrados por provider. */
export async function getDistinctModels(args: {
  start: Date;
  end: Date;
  provider?: string | null;
}): Promise<string[]> {
  const provider = args.provider && args.provider !== "" ? args.provider : undefined;
  const rows = await prisma.llmUsage.groupBy({
    by: ["model"],
    where: {
      createdAt: { gte: args.start, lt: args.end },
      ...(provider !== undefined ? { provider } : {}),
    },
    orderBy: { model: "asc" },
  });
  return rows.map((r) => r.model).filter(Boolean);
}

/** Data da primeira chamada registrada (floor do filtro "Tudo"). */
export async function getFirstUsageDate(): Promise<Date> {
  const row = await prisma.llmUsage.findFirst({
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  if (!row) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }
  return row.createdAt;
}

export interface CustoPorConsulta {
  conversationId: string;
  nReqs: number;
  custoUsdTotal: number;
  tokensInput: number;
  tokensOutput: number;
  tokensCachedInput: number;
  latenciaMsTotal: number;
  todosCustoConhecido: boolean;
  breakdownPorOrigin: Record<
    string,
    { nReqs: number; custoUsd: number; tokensInput: number; tokensOutput: number }
  >;
}

/**
 * Soma TODAS as linhas LlmUsage de uma consulta (mesmo conversationId) , o custo
 * real do turno, cobrindo loop + enhance + guardrail + autoValidator.
 * todosCustoConhecido=false se qualquer linha veio costKnown=false (o harness de
 * custo deve falhar/marcar indisponivel, nunca somar 0 em silencio).
 */
export async function agregarCustoPorConversa(conversationId: string): Promise<CustoPorConsulta> {
  const rows = await prisma.llmUsage.findMany({
    where: { conversationId },
    select: {
      costUsd: true,
      costKnown: true,
      tokensInput: true,
      tokensOutput: true,
      tokensCachedInput: true,
      durationMs: true,
      origin: true,
    },
  });
  const acc: CustoPorConsulta = {
    conversationId,
    nReqs: rows.length,
    custoUsdTotal: 0,
    tokensInput: 0,
    tokensOutput: 0,
    tokensCachedInput: 0,
    latenciaMsTotal: 0,
    todosCustoConhecido: true,
    breakdownPorOrigin: {},
  };
  for (const r of rows) {
    const custo = r.costUsd == null ? 0 : Number(r.costUsd);
    acc.custoUsdTotal += custo;
    acc.tokensInput += r.tokensInput ?? 0;
    acc.tokensOutput += r.tokensOutput ?? 0;
    acc.tokensCachedInput += r.tokensCachedInput ?? 0;
    acc.latenciaMsTotal += r.durationMs ?? 0;
    if (!r.costKnown) acc.todosCustoConhecido = false;
    const key = r.origin ?? "desconhecido";
    const b = (acc.breakdownPorOrigin[key] ??= {
      nReqs: 0,
      custoUsd: 0,
      tokensInput: 0,
      tokensOutput: 0,
    });
    b.nReqs += 1;
    b.custoUsd += custo;
    b.tokensInput += r.tokensInput ?? 0;
    b.tokensOutput += r.tokensOutput ?? 0;
  }
  return acc;
}
