/**
 * Queries server-side para a tela /agente/qualidade.
 *
 * Spec: docs/superpowers/specs/2026-05-26-agente-qualidade-design.md §5.6
 */

import "server-only";
import { prisma } from "@/lib/prisma";

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
}

export interface EvaluationFilters {
  periodStart: Date;
  periodEnd: Date;
  status?: EvalStatus[];
  models?: string[];
  patterns?: string[];
  search?: string;
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
  const grouped = await prisma.conversationQualityEvaluation.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
  });

  const counts: RawEvalCounts = {
    CORRETO: 0,
    PARCIAL: 0,
    ERRADO: 0,
    FORA_DO_ESCOPO: 0,
    PENDENTE: 0,
    FALHA_TECNICA: 0,
  };
  for (const row of grouped) {
    const s = row.status as EvalStatus;
    if (s in counts) counts[s] = row._count._all;
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
      },
    }),
    prisma.conversationQualityEvaluation.count({ where }),
  ]);

  return {
    rows: rows.map((r) => ({
      ...r,
      status: r.status as EvalStatus,
      dominantPattern: r.patterns[0] ?? null,
    })),
    total,
  };
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
  const startIso = filters.periodStart.toISOString();
  const endIso = filters.periodEnd.toISOString();
  const rows = (await prisma.$queryRaw`
    SELECT pattern, COUNT(*)::int AS count
    FROM conversation_quality_evaluations,
         unnest(patterns) AS pattern
    WHERE created_at >= ${startIso}::timestamptz
      AND created_at <= ${endIso}::timestamptz
    GROUP BY pattern
    ORDER BY count DESC
    LIMIT 10
  `) as Array<{ pattern: string; count: number }>;
  return rows;
}

/** Timeseries de % CORRETO por dia, no periodo. */
export async function getDailyCorrectness(
  filters: EvaluationFilters,
): Promise<Array<{ date: string; percent: number | null; total: number }>> {
  const startIso = filters.periodStart.toISOString();
  const endIso = filters.periodEnd.toISOString();
  const rows = (await prisma.$queryRaw`
    SELECT
      date_trunc('day', created_at)::date AS date,
      COUNT(*) FILTER (WHERE status = 'CORRETO')::int AS corretos,
      COUNT(*) FILTER (WHERE status IN ('CORRETO','PARCIAL','ERRADO','FORA_DO_ESCOPO'))::int AS total
    FROM conversation_quality_evaluations
    WHERE created_at >= ${startIso}::timestamptz
      AND created_at <= ${endIso}::timestamptz
    GROUP BY 1
    ORDER BY 1 ASC
  `) as Array<{ date: Date; corretos: number; total: number }>;
  return rows.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    percent: r.total > 0 ? (r.corretos / r.total) * 100 : null,
    total: r.total,
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
    },
  });

  if (!ev) return null;

  let toolCalls: unknown = null;
  let toolResults: unknown = null;
  if (ev.assistantMessageId) {
    const msg = await prisma.message.findUnique({
      where: { id: ev.assistantMessageId },
      select: { toolCalls: true, toolResults: true },
    });
    toolCalls = msg?.toolCalls ?? null;
    toolResults = msg?.toolResults ?? null;
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
      razoes: ev.razoes,
      judgeModel: ev.judgeModel,
      judgeVersion: ev.judgeVersion,
      technicalError: ev.technicalError,
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
  return where;
}
