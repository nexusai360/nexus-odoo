"use server";

/**
 * Server Actions para consulta de logs / audit do servidor MCP.
 *
 * queryAuditLogs — paginação cursor-based por criadoEm (DESC).
 * Filtros: apiKeyId, tool, module, action, status, faixa de data,
 *          busca por idempotencyKey/requestId.
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

export interface AuditLogItem {
  id: string;
  userId: string;
  apiKeyId: string | null;
  /** last4 da chave de API (se disponível via join). */
  apiKeyLast4: string | null;
  tool: string;
  module: string | null;
  action: string | null;
  capability: string | null;
  operation: string | null;
  authMode: string | null;
  status: string | null;
  outcome: string;
  durationMs: number | null;
  rowCount: number | null;
  requestId: string | null;
  idempotencyKey: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  httpStatus: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  eventName: string | null;
  payload: unknown;
  result: unknown;
  snapshotBefore: unknown;
  snapshotAfter: unknown;
  params: unknown;
  criadoEm: string; // ISO string para serialização
}

export interface AuditLogsPage {
  items: AuditLogItem[];
  nextCursor: string | null; // criadoEm ISO + id (composto)
  total: number;
}

const PAGE_SIZE = 50;

// ──────────────────────────────────────────────────────────────────────────────
// Filters schema
// ──────────────────────────────────────────────────────────────────────────────

const filtersSchema = z.object({
  apiKeyId: z.string().uuid().optional(),
  tool: z.string().optional(),
  module: z.string().optional(),
  action: z.string().optional(),
  status: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  search: z.string().optional(), // busca por idempotencyKey ou requestId
});

export type AuditLogFilters = z.infer<typeof filtersSchema>;

// ──────────────────────────────────────────────────────────────────────────────
// queryAuditLogs
// ──────────────────────────────────────────────────────────────────────────────

export async function queryAuditLogs(
  filters: AuditLogFilters,
  cursor?: string, // formato: "<criadoEm ISO>|<id>"
): Promise<{ success: true; data: AuditLogsPage } | { success: false; error: string }> {
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

  // Build where clause
  const where: Prisma.McpAuditLogWhereInput = {};

  if (f.apiKeyId) where.apiKeyId = f.apiKeyId;
  if (f.tool) where.tool = { contains: f.tool, mode: "insensitive" };
  if (f.module) where.module = { contains: f.module, mode: "insensitive" };
  if (f.action) where.action = { contains: f.action, mode: "insensitive" };
  if (f.status) where.status = f.status;

  if (f.dateFrom || f.dateTo) {
    where.criadoEm = {};
    if (f.dateFrom) where.criadoEm.gte = new Date(f.dateFrom);
    if (f.dateTo) where.criadoEm.lte = new Date(f.dateTo);
  }

  if (f.search) {
    where.OR = [
      { idempotencyKey: { contains: f.search, mode: "insensitive" } },
      { requestId: { contains: f.search, mode: "insensitive" } },
    ];
  }

  // Cursor decode
  let cursorWhere: Prisma.McpAuditLogWhereInput | undefined;
  if (cursor) {
    const [dateStr, id] = cursor.split("|");
    if (dateStr && id) {
      const dt = new Date(dateStr);
      if (!isNaN(dt.getTime())) {
        // Rows com criadoEm < dt, ou criadoEm === dt e id < id
        cursorWhere = {
          OR: [
            { criadoEm: { lt: dt } },
            { AND: [{ criadoEm: { equals: dt } }, { id: { lt: id } }] },
          ],
        };
      }
    }
  }

  const finalWhere: Prisma.McpAuditLogWhereInput = cursorWhere
    ? { AND: [where, cursorWhere] }
    : where;

  const [items, total] = await Promise.all([
    prisma.mcpAuditLog.findMany({
      where: finalWhere,
      orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      include: {
        apiKey: {
          select: { last4: true },
        },
      },
    }),
    prisma.mcpAuditLog.count({ where }),
  ]);

  const hasMore = items.length > PAGE_SIZE;
  const pageItems = hasMore ? items.slice(0, PAGE_SIZE) : items;
  const last = pageItems[pageItems.length - 1];
  const nextCursor = hasMore && last
    ? `${last.criadoEm.toISOString()}|${last.id}`
    : null;

  const mapped: AuditLogItem[] = pageItems.map((row) => ({
    id: row.id,
    userId: row.userId,
    apiKeyId: row.apiKeyId ?? null,
    apiKeyLast4: (row as unknown as { apiKey?: { last4: string } | null }).apiKey?.last4 ?? null,
    tool: row.tool,
    module: row.module ?? null,
    action: row.action ?? null,
    capability: row.capability ?? null,
    operation: row.operation ?? null,
    authMode: row.authMode ?? null,
    status: row.status ?? null,
    outcome: row.outcome,
    durationMs: row.durationMs ?? null,
    rowCount: row.rowCount ?? null,
    requestId: row.requestId ?? null,
    idempotencyKey: row.idempotencyKey ?? null,
    errorCode: row.errorCode ?? null,
    errorMessage: row.errorMessage ?? null,
    httpStatus: row.httpStatus ?? null,
    ipAddress: row.ipAddress ?? null,
    userAgent: row.userAgent ?? null,
    eventName: row.eventName ?? null,
    payload: row.payload,
    result: row.result,
    snapshotBefore: row.snapshotBefore,
    snapshotAfter: row.snapshotAfter,
    params: row.params,
    criadoEm: row.criadoEm.toISOString(),
  }));

  return {
    success: true,
    data: { items: mapped, nextCursor, total },
  };
}
