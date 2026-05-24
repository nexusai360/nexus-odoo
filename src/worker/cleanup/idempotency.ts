// src/worker/cleanup/idempotency.ts
// Limpa registros expirados da tabela McpIdempotencyRecord.
// Agendado como repeatable BullMQ horário em src/worker/index.ts.

import type { PrismaClient } from "@/generated/prisma/client";

export interface CleanupIdempotencyResult {
  deleted: number;
  cutoff: Date;
}

/**
 * Remove todos os registros de idempotência expirados (`expiresAt < agora`).
 * Retorna o número de registros deletados e o timestamp de corte usado.
 */
export async function cleanupExpiredIdempotency(
  prisma: PrismaClient,
): Promise<CleanupIdempotencyResult> {
  const cutoff = new Date();
  const result = await prisma.mcpIdempotencyRecord.deleteMany({
    where: { expiresAt: { lt: cutoff } },
  });
  return { deleted: result.count, cutoff };
}
