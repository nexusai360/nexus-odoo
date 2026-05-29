#!/usr/bin/env tsx
/**
 * Remove evaluations PENDENTE cuja conversation NAO veio de bateria de
 * auditoria (title sem prefixo [AUDIT-). Sao "lixo": conversas reais de
 * usuario que ficaram com eval pendente nunca avaliadas e nao tem
 * relevancia pra metricas.
 *
 * Tambem preserva evaluations ja avaliadas (status != PENDENTE) mesmo
 * quando a conversation nao veio de bateria.
 */
// Primeiro import: carrega .env.local antes de @/lib/prisma (ver load-env.ts).
import "./load-env";
import "dotenv/config";
import { config as loadDotenv } from "dotenv";
import { resolve as resolvePath } from "path";
loadDotenv({ path: resolvePath(process.cwd(), ".env.local"), override: true });
import { prisma } from "@/lib/prisma";

async function main() {
  // Conta antes
  const before = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
    SELECT COUNT(*)::bigint as cnt
    FROM conversation_quality_evaluations e
    JOIN conversations c ON c.id = e.conversation_id
    WHERE e.status = 'PENDENTE' AND c.title NOT LIKE '[AUDIT-%'
  `;
  console.log(`Antes: ${before[0].cnt} evals PENDENTE sem marker AUDIT`);

  // Quantas PENDENTE total e por marker?
  const breakdown = await prisma.$queryRaw<Array<{ tipo: string; cnt: bigint }>>`
    SELECT
      CASE WHEN c.title LIKE '[AUDIT-%' THEN 'com_audit' ELSE 'sem_audit' END as tipo,
      COUNT(*)::bigint as cnt
    FROM conversation_quality_evaluations e
    JOIN conversations c ON c.id = e.conversation_id
    WHERE e.status = 'PENDENTE'
    GROUP BY tipo
  `;
  console.log("PENDENTE breakdown:");
  for (const r of breakdown) console.log(`  ${r.cnt.toString().padStart(5)}  ${r.tipo}`);

  // DELETE via subquery
  const deleted = await prisma.$executeRaw`
    DELETE FROM conversation_quality_evaluations
    WHERE id IN (
      SELECT e.id
      FROM conversation_quality_evaluations e
      JOIN conversations c ON c.id = e.conversation_id
      WHERE e.status = 'PENDENTE'
        AND (c.title IS NULL OR c.title NOT LIKE '[AUDIT-%')
    )
  `;
  console.log(`Deletadas: ${deleted} rows`);

  // Status atual
  const status = await prisma.$queryRaw<Array<{ status: string; cnt: bigint }>>`
    SELECT status, COUNT(*)::bigint as cnt
    FROM conversation_quality_evaluations
    GROUP BY status ORDER BY cnt DESC
  `;
  console.log("\nDistribuicao atual:");
  for (const r of status) console.log(`  ${r.cnt.toString().padStart(5)}  ${r.status}`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
