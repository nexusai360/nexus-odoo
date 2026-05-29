#!/usr/bin/env tsx
// Primeiro import: carrega .env.local antes de @/lib/prisma (ver load-env.ts).
import "./load-env";
import "dotenv/config";
import { config as loadDotenv } from "dotenv";
import { resolve as resolvePath } from "path";
loadDotenv({ path: resolvePath(process.cwd(), ".env.local"), override: true });
import { prisma } from "@/lib/prisma";

async function main() {
  // 1. Normalizar FORA_DE_ESCOPO -> FORA_DO_ESCOPO
  const upd = await prisma.$executeRaw`
    UPDATE conversation_quality_evaluations
    SET status = 'FORA_DO_ESCOPO'
    WHERE status = 'FORA_DE_ESCOPO'
  `;
  console.log(`Normalizadas: ${upd} rows FORA_DE_ESCOPO -> FORA_DO_ESCOPO`);

  // 2. Listar markers únicos (regex extract do prefixo)
  const markers = await prisma.$queryRawUnsafe<Array<{ marker: string; cnt: bigint; first_at: Date }>>(
    `SELECT marker, COUNT(*)::bigint as cnt, MIN(first_at) as first_at
     FROM (
       SELECT
         substring(c.title from position('[' in c.title) for (position(']' in c.title) - position('[' in c.title) + 1)) as marker,
         c.created_at as first_at,
         e.id as eid
       FROM conversations c
       JOIN conversation_quality_evaluations e ON e.conversation_id = c.id
       WHERE c.title LIKE '%[AUDIT-%'
     ) sub
     WHERE marker IS NOT NULL AND marker LIKE '[AUDIT-%'
     GROUP BY marker
     ORDER BY MIN(first_at) ASC`,
  );
  console.log("\nMarkers únicos (cronologico):");
  for (const m of markers) {
    console.log(`  ${m.first_at.toISOString().substring(0, 16)}  ${m.cnt.toString().padStart(4)}  ${m.marker}`);
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
