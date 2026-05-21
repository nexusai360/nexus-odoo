"use server";

/**
 * Server Actions de consulta do log de chamadas a MCPs externos (Plugar MCP).
 *
 * Distinto de `mcp-audit-query.ts`, que consulta o MCP interno (Servidor MCP).
 * Aqui sao as chamadas que o Agente Nex FAZ aos servidores MCP externos
 * cadastrados em Plugar MCP, capturadas em `src/lib/agent/external-mcp.ts`.
 *
 * Gate: super_admin.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireSuperAdmin } from "@/lib/actions/_helpers";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface ExternalMcpCallLogItem {
  id: string;
  serverId: string | null;
  serverName: string;
  toolName: string;
  outcome: string;
  durationMs: number | null;
  errorMessage: string | null;
  argsPreview: unknown;
  userId: string;
  criadoEm: string; // ISO string para serializacao
}

export interface ExternalMcpCallLogsPage {
  items: ExternalMcpCallLogItem[];
  nextCursor: string | null;
  total: number;
}

/** Resumo das chamadas a MCP externo, para a Visao Geral do Plugar MCP. */
export interface ExternalMcpCallStats {
  totalCalls: number;
  errorCount: number;
  errorRate: number; // 0..1
  medianDurationMs: number | null;
  topServers: { serverId: string | null; serverName: string; count: number }[];
}

const PAGE_SIZE = 50;

// ──────────────────────────────────────────────────────────────────────────────
// Filtros
// ──────────────────────────────────────────────────────────────────────────────

const filtersSchema = z.object({
  serverId: z.string().uuid().optional(),
  status: z.string().optional(), // outcome: ok | error
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  search: z.string().optional(), // busca por toolName
});

export type ExternalMcpCallLogFilters = z.infer<typeof filtersSchema>;

// ──────────────────────────────────────────────────────────────────────────────
// queryExternalMcpCallLogs
// ──────────────────────────────────────────────────────────────────────────────

export async function queryExternalMcpCallLogs(
  filters: ExternalMcpCallLogFilters,
  cursor?: string, // "<criadoEm ISO>|<id>"
): Promise<
  { success: true; data: ExternalMcpCallLogsPage } | { success: false; error: string }
> {
  try {
    await requireSuperAdmin();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const parsed = filtersSchema.safeParse(filters);
  if (!parsed.success) {
    return { success: false, error: "Filtros inválidos" };
  }
  const f = parsed.data;

  const where: Prisma.ExternalMcpCallLogWhereInput = {};
  if (f.serverId) where.serverId = f.serverId;
  if (f.status) where.outcome = f.status;
  if (f.dateFrom || f.dateTo) {
    where.criadoEm = {};
    if (f.dateFrom) where.criadoEm.gte = new Date(f.dateFrom);
    if (f.dateTo) where.criadoEm.lte = new Date(f.dateTo);
  }
  if (f.search) {
    where.toolName = { contains: f.search, mode: "insensitive" };
  }

  let cursorWhere: Prisma.ExternalMcpCallLogWhereInput | undefined;
  if (cursor) {
    const [dateStr, id] = cursor.split("|");
    if (dateStr && id) {
      const dt = new Date(dateStr);
      if (!isNaN(dt.getTime())) {
        cursorWhere = {
          OR: [
            { criadoEm: { lt: dt } },
            { AND: [{ criadoEm: { equals: dt } }, { id: { lt: id } }] },
          ],
        };
      }
    }
  }

  const finalWhere: Prisma.ExternalMcpCallLogWhereInput = cursorWhere
    ? { AND: [where, cursorWhere] }
    : where;

  const [rows, total] = await Promise.all([
    prisma.externalMcpCallLog.findMany({
      where: finalWhere,
      orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
    }),
    prisma.externalMcpCallLog.count({ where }),
  ]);

  const hasMore = rows.length > PAGE_SIZE;
  const pageRows = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const last = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && last ? `${last.criadoEm.toISOString()}|${last.id}` : null;

  const items: ExternalMcpCallLogItem[] = pageRows.map((row) => ({
    id: row.id,
    serverId: row.serverId ?? null,
    serverName: row.serverName,
    toolName: row.toolName,
    outcome: row.outcome,
    durationMs: row.durationMs ?? null,
    errorMessage: row.errorMessage ?? null,
    argsPreview: row.argsPreview,
    userId: row.userId,
    criadoEm: row.criadoEm.toISOString(),
  }));

  return { success: true, data: { items, nextCursor, total } };
}

// ──────────────────────────────────────────────────────────────────────────────
// externalMcpCallStats
// ──────────────────────────────────────────────────────────────────────────────

export async function externalMcpCallStats(
  hours = 24,
): Promise<{ success: true; data: ExternalMcpCallStats } | { success: false; error: string }> {
  try {
    await requireSuperAdmin();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const where: Prisma.ExternalMcpCallLogWhereInput = { criadoEm: { gte: since } };

  const [totalCalls, errorCount, grouped, durationRows] = await Promise.all([
    prisma.externalMcpCallLog.count({ where }),
    prisma.externalMcpCallLog.count({ where: { ...where, outcome: "error" } }),
    prisma.externalMcpCallLog.groupBy({
      by: ["serverId", "serverName"],
      where,
      _count: { _all: true },
      orderBy: { _count: { serverId: "desc" } },
      take: 5,
    }),
    prisma.externalMcpCallLog.findMany({
      where: { ...where, durationMs: { not: null } },
      select: { durationMs: true },
    }),
  ]);

  // Mediana calculada em JS: volume de chamadas a MCP externo e baixo.
  const durations = durationRows
    .map((r) => r.durationMs)
    .filter((d): d is number => d != null)
    .sort((a, b) => a - b);
  let medianDurationMs: number | null = null;
  if (durations.length > 0) {
    const mid = Math.floor(durations.length / 2);
    medianDurationMs =
      durations.length % 2 === 0
        ? Math.round((durations[mid - 1] + durations[mid]) / 2)
        : durations[mid];
  }

  return {
    success: true,
    data: {
      totalCalls,
      errorCount,
      errorRate: totalCalls > 0 ? errorCount / totalCalls : 0,
      medianDurationMs,
      topServers: grouped.map((g) => ({
        serverId: g.serverId ?? null,
        serverName: g.serverName,
        count: g._count._all,
      })),
    },
  };
}
