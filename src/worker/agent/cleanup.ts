/**
 * Job de limpeza da tabela de idempotência do webhook receptor.
 *
 * Remove registros de ProcessedWhatsappMessage com processedAt > 7 dias.
 * Executado diariamente via cron no worker (Task 4.6).
 */

import { prisma } from "../prisma";

const RETENTION_DAYS = 7;

export async function cleanupIdempotencyTable(): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const result = await prisma.processedWhatsappMessage.deleteMany({
    where: { processedAt: { lt: cutoff } },
  });

  console.log(`[cleanup] removidos ${result.count} registros de idempotência expirados`);
  return { deleted: result.count };
}
