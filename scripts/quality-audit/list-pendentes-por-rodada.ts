#!/usr/bin/env tsx
import "dotenv/config";
import { config as loadDotenv } from "dotenv";
import { resolve as resolvePath } from "path";
loadDotenv({ path: resolvePath(process.cwd(), ".env.local"), override: true });
import { prisma } from "@/lib/prisma";

async function main() {
  const rows = await prisma.$queryRaw<Array<{ marker: string; cnt: bigint }>>`
    SELECT marker, COUNT(*)::bigint as cnt
    FROM (
      SELECT
        substring(c.title from position('[' in c.title) for (position(']' in c.title) - position('[' in c.title) + 1)) AS marker,
        e.id
      FROM conversation_quality_evaluations e
      JOIN conversations c ON c.id = e.conversation_id
      WHERE e.status = 'PENDENTE' AND c.title LIKE '[AUDIT-%'
    ) sub
    GROUP BY marker
    ORDER BY marker
  `;
  console.log("Pendentes por marker:");
  for (const r of rows) console.log(`  ${r.cnt.toString().padStart(4)}  ${r.marker}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
