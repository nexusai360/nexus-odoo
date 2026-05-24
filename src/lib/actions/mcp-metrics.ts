"use server";

/**
 * Server Actions para métricas do servidor MCP.
 *
 * getMcp24hMetrics , agrega mcp_audit_log das últimas 24 horas:
 *   - total de chamadas
 *   - percentual de erro
 *   - top 5 tools mais chamadas
 *   - latência p50 e p99 (PERCENTILE_CONT, via $queryRaw)
 *
 * Gate: super_admin.
 * Campo de data no schema: criadoEm → criado_em (mapeado pelo Prisma).
 */

import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/actions/_helpers";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface TopTool {
  tool: string;
  total: number;
  errors: number;
}

export interface Mcp24hMetrics {
  totalCalls: number;
  errorRate: number; // 0-100
  topTools: TopTool[];
  p50Ms: number | null;
  p99Ms: number | null;
  windowStart: Date;
}

type DataResult<T> = { success: true; data: T } | { success: false; error: string };

// ──────────────────────────────────────────────────────────────────────────────
// getMcp24hMetrics
// ──────────────────────────────────────────────────────────────────────────────

export async function getMcp24hMetrics(): Promise<DataResult<Mcp24hMetrics>> {
  try {
    await requireSuperAdmin();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    // ── totais básicos ──────────────────────────────────────────────────────
    const totalCount = await prisma.mcpAuditLog.count({
      where: { criadoEm: { gte: windowStart } },
    });

    const errorCount = await prisma.mcpAuditLog.count({
      where: {
        criadoEm: { gte: windowStart },
        outcome: "error",
      },
    });

    // ── top 5 tools ─────────────────────────────────────────────────────────
    const topRaw = await prisma.mcpAuditLog.groupBy({
      by: ["tool"],
      where: { criadoEm: { gte: windowStart } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    });

    // Para cada tool, contar erros separadamente
    const topTools: TopTool[] = await Promise.all(
      topRaw.map(async (row) => {
        const errCount = await prisma.mcpAuditLog.count({
          where: {
            tool: row.tool,
            criadoEm: { gte: windowStart },
            outcome: "error",
          },
        });
        return { tool: row.tool, total: row._count.id, errors: errCount };
      }),
    );

    // ── percentis de latência (PERCENTILE_CONT) ──────────────────────────────
    // Apenas registros com durationMs preenchido
    const percentileResult = await prisma.$queryRaw<
      Array<{ p50: number | null; p99: number | null }>
    >`
      SELECT
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY duration_ms) AS p50,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_ms) AS p99
      FROM mcp_audit_log
      WHERE criado_em >= ${windowStart}
        AND duration_ms IS NOT NULL
    `;

    const p50Ms = percentileResult[0]?.p50 ?? null;
    const p99Ms = percentileResult[0]?.p99 ?? null;

    return {
      success: true,
      data: {
        totalCalls: totalCount,
        errorRate: totalCount > 0 ? (errorCount / totalCount) * 100 : 0,
        topTools,
        p50Ms: p50Ms != null ? Math.round(Number(p50Ms)) : null,
        p99Ms: p99Ms != null ? Math.round(Number(p99Ms)) : null,
        windowStart,
      },
    };
  } catch (err) {
    console.error("[mcp-metrics] getMcp24hMetrics error:", err);
    return { success: false, error: "Erro ao buscar métricas do MCP" };
  }
}
