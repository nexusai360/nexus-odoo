/**
 * Queries server-side para a tela /agente/qualidade.
 *
 * Spec: docs/superpowers/specs/2026-05-26-agente-qualidade-design.md §5.6
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { formatDateInTz, DEFAULT_TZ } from "@/lib/datetime-core";

// ---------------------------------------------------------------------------
// Tipos publicos
// ---------------------------------------------------------------------------

export type EvalStatus =
  | "CORRETO"
  | "PARCIAL"
  | "ERRADO"
  | "FORA_DO_ESCOPO"
  | "PENDENTE"
  | "FALHA_TECNICA";

export interface RawEvalCounts {
  CORRETO: number;
  PARCIAL: number;
  ERRADO: number;
  FORA_DO_ESCOPO: number;
  PENDENTE: number;
  FALHA_TECNICA: number;
}

export interface QualityKpisV2 {
  totalAvaliado: number;
  corretos: number;
  parciais: number;
  errados: number;
  foraDoEscopo: number;
  pendentes: number;
  falhasTecnicas: number;
  percentCorreto: number | null;
}

export interface EvaluationRow {
  id: string;
  createdAt: Date;
  conversationId: string;
  status: EvalStatus;
  patterns: string[];
  model: string | null;
  questionSnapshot: string | null;
  answerSnapshot: string | null;
  dominantPattern: string | null;
  humanStatus: string | null;
  /** Marcador da rodada (Conversation.title) - prefixo "[AUDIT-...]" gerado
   *  pelo harness scripts/quality-audit/03-run-test-questions.ts. null
   *  para conversas in-app/playground normais. */
  rodada: string | null;
  /** Channel do Prisma `AgentChannel`. Quando rodada=null, usado para
   *  derivar a origem virtual (Agente Nex vs Playground). */
  channel: string | null;
}

export interface EvaluationFilters {
  periodStart: Date;
  periodEnd: Date;
  status?: EvalStatus[];
  models?: string[];
  patterns?: string[];
  search?: string;
  /** Filtro por rodada/batch (Conversation.title). Lista de markers
   *  ex.: ["[AUDIT-POS-2026-05-26T03-43-05]", ...] ou markers virtuais de
   *  origem (`__origem:agente-nex`, `__origem:playground`). Renomeado
   *  conceitualmente para "origens" mas mantemos o campo `rodadas` para
   *  compatibilidade com a API atual. */
  rodadas?: string[];
}

// ---------------------------------------------------------------------------
// Pure: KPI calculator (testavel sem DB)
// ---------------------------------------------------------------------------

export function calculateKpis(counts: RawEvalCounts): QualityKpisV2 {
  const totalAvaliado =
    counts.CORRETO + counts.PARCIAL + counts.ERRADO + counts.FORA_DO_ESCOPO;
  return {
    totalAvaliado,
    corretos: counts.CORRETO,
    parciais: counts.PARCIAL,
    errados: counts.ERRADO,
    foraDoEscopo: counts.FORA_DO_ESCOPO,
    pendentes: counts.PENDENTE,
    falhasTecnicas: counts.FALHA_TECNICA,
    percentCorreto:
      totalAvaliado > 0 ? (counts.CORRETO / totalAvaliado) * 100 : null,
  };
}

// ---------------------------------------------------------------------------
// DB queries
// ---------------------------------------------------------------------------

export async function getRawCounts(
  filters: EvaluationFilters,
): Promise<RawEvalCounts> {
  const where = buildWhere(filters);
  // Status EFETIVO: o ajuste humano (human_status) sobrescreve o veredito
  // automatico (heuristica/LLM). Por isso nao da pra usar groupBy("status")
  // puro , o ajuste manual precisa ser contabilizado nos KPIs. Buscamos os
  // dois campos e agregamos pelo efetivo. O filtro de periodo limita o volume.
  const rows = await prisma.conversationQualityEvaluation.findMany({
    where,
    select: { status: true, humanStatus: true },
  });

  const counts: RawEvalCounts = {
    CORRETO: 0,
    PARCIAL: 0,
    ERRADO: 0,
    FORA_DO_ESCOPO: 0,
    PENDENTE: 0,
    FALHA_TECNICA: 0,
  };
  for (const row of rows) {
    const s = (row.humanStatus ?? row.status) as EvalStatus;
    if (s in counts) counts[s] += 1;
  }
  return counts;
}

export async function getKpis(
  filters: EvaluationFilters,
): Promise<QualityKpisV2> {
  return calculateKpis(await getRawCounts(filters));
}

export async function listEvaluations(
  filters: EvaluationFilters,
  pagination: { page: number; pageSize: number },
): Promise<{ rows: EvaluationRow[]; total: number }> {
  const where = buildWhere(filters);
  const [rows, total] = await Promise.all([
    prisma.conversationQualityEvaluation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      select: {
        id: true,
        createdAt: true,
        conversationId: true,
        status: true,
        patterns: true,
        model: true,
        questionSnapshot: true,
        answerSnapshot: true,
        humanStatus: true,
        conversation: { select: { title: true, channel: true } },
      },
    }),
    prisma.conversationQualityEvaluation.count({ where }),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      conversationId: r.conversationId,
      status: r.status as EvalStatus,
      patterns: r.patterns,
      model: r.model,
      questionSnapshot: r.questionSnapshot,
      answerSnapshot: r.answerSnapshot,
      humanStatus: r.humanStatus,
      dominantPattern: r.patterns[0] ?? null,
      rodada: extractRodadaMarker(r.conversation?.title ?? null),
      channel: (r.conversation?.channel as string | null) ?? null,
    })),
    total,
  };
}

/** Extrai o marker da rodada do title da Conversation. */
function extractRodadaMarker(title: string | null): string | null {
  if (!title) return null;
  const m = title.match(/^\[AUDIT-[^\]]+\]/);
  return m ? m[0] : null;
}

/** Lista markers de origem distintos no periodo:
 *  - Markers de rodada (`[AUDIT-POS-...]`) gerados pelo harness
 *    `scripts/quality-audit/03-run-test-questions.ts`.
 *  - Markers virtuais (`__origem:agente-nex`, `__origem:playground`)
 *    representando conversas do agente em uso real (in_app/whatsapp e
 *    playground respectivamente). Sao incluidos com count > 0 apenas. */
export async function getDistinctRodadas(
  filters: EvaluationFilters,
): Promise<Array<{ marker: string; count: number }>> {
  const startIso = filters.periodStart.toISOString();
  const endIso = filters.periodEnd.toISOString();
  const auditRows = (await prisma.$queryRaw`
    SELECT marker, COUNT(*)::int AS count
    FROM (
      SELECT
        substring(c.title from position('[' in c.title) for (position(']' in c.title) - position('[' in c.title) + 1)) AS marker,
        e.id AS eid
      FROM conversation_quality_evaluations e
      JOIN conversations c ON c.id = e.conversation_id
      WHERE e.created_at >= ${startIso}::timestamptz
        AND e.created_at <= ${endIso}::timestamptz
        AND c.title LIKE '[AUDIT-%'
    ) sub
    WHERE marker LIKE '[AUDIT-%'
    GROUP BY marker
    ORDER BY marker DESC
  `) as Array<{ marker: string; count: number }>;

  // Origens virtuais: conta avaliacoes em conversas SEM marker de auditoria
  // agrupadas por channel. Garante que so aparecem na lista quando ha
  // dado real (count > 0).
  const virtualRows = (await prisma.$queryRaw`
    SELECT c.channel AS channel, COUNT(*)::int AS count
    FROM conversation_quality_evaluations e
    JOIN conversations c ON c.id = e.conversation_id
    WHERE e.created_at >= ${startIso}::timestamptz
      AND e.created_at <= ${endIso}::timestamptz
      AND (c.title IS NULL OR c.title NOT LIKE '[AUDIT-%')
    GROUP BY c.channel
  `) as Array<{ channel: string; count: number }>;

  let agenteNexCount = 0;
  let playgroundCount = 0;
  for (const r of virtualRows) {
    if (r.channel === "in_app" || r.channel === "whatsapp") {
      agenteNexCount += r.count;
    } else if (r.channel === "playground") {
      playgroundCount += r.count;
    }
  }

  const out: Array<{ marker: string; count: number }> = [...auditRows];
  if (agenteNexCount > 0) {
    out.unshift({ marker: "__origem:agente-nex", count: agenteNexCount });
  }
  if (playgroundCount > 0) {
    out.unshift({ marker: "__origem:playground", count: playgroundCount });
  }
  return out;
}

/**
 * Retorna TODOS os markers de rodada de auditoria existentes, sem filtro de
 * periodo. Usado para construir a numeracao canonica (R8, R9, ...) via
 * `buildRodadaNamesFromMarkers`: a numeracao precisa ser GLOBAL para ficar
 * estavel entre as views (semana/mes/tudo). Se construirmos o mapa so com os
 * markers do periodo selecionado, a rodada recente vira "Rodada 8" no recorte
 * curto (era o bug do rotulador).
 */
export async function getAllRodadaMarkers(): Promise<string[]> {
  // So markers de rodadas REAIS de backtest: aquelas que tem avaliacao de
  // qualidade. Os ~10 markers de teste/dev de pre-catalogo (manha de 26/05)
  // nao tem nenhuma avaliacao e, portanto, sao naturalmente excluidos da
  // numeracao (ver pericia 2026-06-01 e R8_ANCHOR_MARKER em rodada-labels.ts).
  const rows = (await prisma.$queryRaw`
    SELECT DISTINCT
      substring(c.title from position('[' in c.title) for (position(']' in c.title) - position('[' in c.title) + 1)) AS marker
    FROM conversations c
    JOIN conversation_quality_evaluations e ON e.conversation_id = c.id
    WHERE c.title LIKE '[AUDIT-%'
  `) as Array<{ marker: string | null }>;
  return rows
    .map((r) => r.marker)
    .filter((m): m is string => !!m && m.startsWith("[AUDIT-"));
}

export async function getDistinctModels(): Promise<string[]> {
  const rows = await prisma.conversationQualityEvaluation.findMany({
    where: { model: { not: null } },
    distinct: ["model"],
    select: { model: true },
  });
  return rows
    .map((r) => r.model!)
    .filter(Boolean)
    .sort();
}

export async function getDistinctPatterns(
  filters: EvaluationFilters,
): Promise<Array<{ pattern: string; count: number }>> {
  const rows = await prisma.conversationQualityEvaluation.findMany({
    where: { ...buildWhere(filters), NOT: { patterns: { isEmpty: true } } },
    select: { patterns: true },
  });
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const p of r.patterns) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

/** Timeseries de % CORRETO por dia, no periodo. */
export async function getDailyCorrectness(
  filters: EvaluationFilters,
): Promise<
  Array<{ date: string; percent: number | null; total: number; marker: string | null }>
> {
  const rows = await prisma.conversationQualityEvaluation.findMany({
    where: buildWhere(filters),
    select: {
      createdAt: true,
      status: true,
      humanStatus: true,
      conversation: { select: { title: true } },
    },
  });
  const byDay = new Map<
    string,
    { corretos: number; total: number; marker: string | null; markerAt: number }
  >();
  for (const r of rows) {
    // Bucket por DIA no fuso de Brasilia (UTC-3), nao UTC. Sem isso, avaliacoes
    // entre 21h e 00h BRT caem no dia seguinte (UTC) e o grafico fica errado.
    // en-CA garante o formato YYYY-MM-DD (sortavel).
    const key = formatDateInTz(r.createdAt, DEFAULT_TZ, "en-CA");
    const cur =
      byDay.get(key) ?? { corretos: 0, total: 0, marker: null, markerAt: 0 };
    // Status efetivo: ajuste humano sobrescreve o veredito automatico.
    const eff = r.humanStatus ?? r.status;
    if (["CORRETO", "PARCIAL", "ERRADO", "FORA_DO_ESCOPO"].includes(eff)) {
      cur.total++;
      if (eff === "CORRETO") cur.corretos++;
    }
    // Marker da rodada do dia: o AUDIT-POS mais recente daquele dia.
    const title = r.conversation?.title ?? "";
    const m = title.match(/\[AUDIT-[^\]]*\]/);
    if (m && r.createdAt.getTime() >= cur.markerAt) {
      cur.marker = m[0];
      cur.markerAt = r.createdAt.getTime();
    }
    byDay.set(key, cur);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { corretos, total, marker }]) => ({
      date,
      percent: total > 0 ? (corretos / total) * 100 : null,
      total,
      marker,
    }));
}

export async function getEvaluationDetail(
  id: string,
): Promise<{
  evaluation: EvaluationRow & {
    razoes: string;
    judgeModel: string | null;
    judgeVersion: string;
    technicalError: string | null;
    humanReviewedBy: string | null;
    humanReviewedAt: Date | null;
    suggestions: string[];
  };
  toolCalls: unknown;
  toolResults: unknown;
} | null> {
  const ev = await prisma.conversationQualityEvaluation.findUnique({
    where: { id },
    select: {
      id: true,
      createdAt: true,
      conversationId: true,
      assistantMessageId: true,
      status: true,
      patterns: true,
      model: true,
      questionSnapshot: true,
      answerSnapshot: true,
      humanStatus: true,
      humanReviewedBy: true,
      humanReviewedAt: true,
      razoes: true,
      judgeModel: true,
      judgeVersion: true,
      technicalError: true,
      suggestions: true,
      conversation: { select: { title: true, channel: true } },
    },
  });

  if (!ev) return null;

  // BUG FIX (2026-05-26): a Message linkada via assistantMessageId é a
  // mensagem FINAL do turno (persistMessageAndReturnId, SEM toolCalls).
  // As toolCalls vivem nas Messages assistant INTERMEDIARIAS do mesmo
  // turno (persistAssistantMessageWithTools). Pra mostrar o que o agente
  // realmente fez, agregamos TODAS as messages assistant entre a ultima
  // user message anterior e a assistantMessageId final.
  let toolCalls: unknown = null;
  let toolResults: unknown = null;
  if (ev.assistantMessageId) {
    const finalMsg = await prisma.message.findUnique({
      where: { id: ev.assistantMessageId },
      select: { createdAt: true, conversationId: true },
    });
    if (finalMsg) {
      const lastUserBefore = await prisma.message.findFirst({
        where: {
          conversationId: finalMsg.conversationId,
          role: "user",
          createdAt: { lt: finalMsg.createdAt },
        },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      const assistantsTurno = await prisma.message.findMany({
        where: {
          conversationId: finalMsg.conversationId,
          role: "assistant",
          createdAt: {
            ...(lastUserBefore ? { gt: lastUserBefore.createdAt } : {}),
            lte: finalMsg.createdAt,
          },
        },
        orderBy: { createdAt: "asc" },
        select: { toolCalls: true, toolResults: true },
      });
      const calls: unknown[] = [];
      const results: unknown[] = [];
      for (const m of assistantsTurno) {
        if (Array.isArray(m.toolCalls)) calls.push(...(m.toolCalls as unknown[]));
        else if (m.toolCalls != null) calls.push(m.toolCalls);
        if (Array.isArray(m.toolResults)) results.push(...(m.toolResults as unknown[]));
        else if (m.toolResults != null) results.push(m.toolResults);
      }
      toolCalls = calls.length > 0 ? calls : null;
      toolResults = results.length > 0 ? results : null;
    }
  }

  return {
    evaluation: {
      id: ev.id,
      createdAt: ev.createdAt,
      conversationId: ev.conversationId,
      status: ev.status as EvalStatus,
      patterns: ev.patterns,
      model: ev.model,
      questionSnapshot: ev.questionSnapshot,
      answerSnapshot: ev.answerSnapshot,
      humanStatus: ev.humanStatus,
      humanReviewedBy: ev.humanReviewedBy,
      humanReviewedAt: ev.humanReviewedAt,
      dominantPattern: ev.patterns[0] ?? null,
      rodada: extractRodadaMarker(ev.conversation?.title ?? null),
      channel: (ev.conversation?.channel as string | null) ?? null,
      razoes: ev.razoes,
      judgeModel: ev.judgeModel,
      judgeVersion: ev.judgeVersion,
      technicalError: ev.technicalError,
      suggestions: ev.suggestions,
    },
    toolCalls,
    toolResults,
  };
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function buildWhere(filters: EvaluationFilters) {
  const where: Record<string, unknown> = {
    createdAt: { gte: filters.periodStart, lte: filters.periodEnd },
  };
  if (filters.status && filters.status.length > 0) {
    where.status = { in: filters.status };
  }
  if (filters.models && filters.models.length > 0) {
    where.model = { in: filters.models };
  }
  if (filters.patterns && filters.patterns.length > 0) {
    where.patterns = { hasSome: filters.patterns };
  }
  if (filters.search && filters.search.trim().length > 0) {
    const s = filters.search.trim();
    where.OR = [
      { questionSnapshot: { contains: s, mode: "insensitive" } },
      { answerSnapshot: { contains: s, mode: "insensitive" } },
    ];
  }
  if (filters.rodadas && filters.rodadas.length > 0) {
    // Origens podem ser markers de rodada de auditoria (`[AUDIT-POS-...]`)
    // ou markers virtuais (`__origem:agente-nex`, `__origem:playground`).
    // Cada bucket aplica filtro distinto sobre a Conversation.
    const auditMarkers = filters.rodadas.filter((r) => r.startsWith("[AUDIT"));
    const wantsAgenteNex = filters.rodadas.includes("__origem:agente-nex");
    const wantsPlayground = filters.rodadas.includes("__origem:playground");
    const ors: Array<Record<string, unknown>> = [];
    for (const marker of auditMarkers) {
      ors.push({ title: { startsWith: marker } });
    }
    if (wantsAgenteNex) {
      // Conversas vindas do agente em uso real: in_app + whatsapp, e cujo
      // title NAO carrega um marker de rodada de auditoria.
      ors.push({
        channel: { in: ["in_app", "whatsapp"] },
        OR: [
          { title: null },
          { NOT: { title: { startsWith: "[AUDIT" } } },
        ],
      });
    }
    if (wantsPlayground) {
      ors.push({
        channel: "playground",
        OR: [
          { title: null },
          { NOT: { title: { startsWith: "[AUDIT" } } },
        ],
      });
    }
    if (ors.length > 0) {
      where.conversation = { OR: ors };
    }
  }
  return where;
}
