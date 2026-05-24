// src/worker/cleanup/audit-log.ts
// Limpeza periódica do McpAuditLog em 2 etapas:
//   1. Nullify: zerá campos de detalhe (payload/result/snapshots) após <detailCutoff> dias.
//   2. Delete: remove registros completos após <fullCutoff> dias.
//
// Agendado como repeatable BullMQ diário às 01:00 BRT em src/worker/index.ts.
// Usa `criadoEm` (mapeado para `criado_em`) , não `createdAt`.

import type { PrismaClient } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";

/** Número de dias padrão para retenção de detalhes do log de auditoria. */
const DEFAULT_DETAIL_RETENTION_DAYS = 90;
/** Número de dias padrão para retenção total do log de auditoria. */
const DEFAULT_FULL_RETENTION_DAYS = 730;

export interface AuditLogCleanupResult {
  nullified: number;
  deleted: number;
  detailCutoff: Date;
  fullCutoff: Date;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function envDays(envVar: string, defaultVal: number): number {
  const raw = process.env[envVar];
  if (!raw) return defaultVal;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultVal;
}

/**
 * Executa a limpeza em 2 etapas:
 * 1. Nullify campos de detalhe em registros antigos (> detailRetentionDays).
 * 2. Delete registros muito antigos (> fullRetentionDays).
 */
export async function cleanupAuditLog(
  prisma: PrismaClient,
): Promise<AuditLogCleanupResult> {
  const detailDays = envDays("MCP_AUDIT_DETAIL_RETENTION_DAYS", DEFAULT_DETAIL_RETENTION_DAYS);
  const fullDays = envDays("MCP_AUDIT_FULL_RETENTION_DAYS", DEFAULT_FULL_RETENTION_DAYS);

  const detailCutoff = daysAgo(detailDays);
  const fullCutoff = daysAgo(fullDays);

  // Etapa 1: Nullify campos de detalhe em registros antigos mas ainda retidos
  const nullifyResult = await prisma.mcpAuditLog.updateMany({
    where: {
      criadoEm: { lt: detailCutoff },
      // Evita re-processar registros já nullificados (performance)
      // Qualquer campo de detalhe não-nulo indica que ainda há dados a limpar
      OR: [
        { payload: { not: Prisma.JsonNull } },
        { result: { not: Prisma.JsonNull } },
        { snapshotBefore: { not: Prisma.JsonNull } },
        { snapshotAfter: { not: Prisma.JsonNull } },
      ],
    },
    data: {
      payload: Prisma.JsonNull,
      result: Prisma.JsonNull,
      snapshotBefore: Prisma.JsonNull,
      snapshotAfter: Prisma.JsonNull,
    },
  });

  // Etapa 2: Delete completo de registros muito antigos
  const deleteResult = await prisma.mcpAuditLog.deleteMany({
    where: { criadoEm: { lt: fullCutoff } },
  });

  return {
    nullified: nullifyResult.count,
    deleted: deleteResult.count,
    detailCutoff,
    fullCutoff,
  };
}
