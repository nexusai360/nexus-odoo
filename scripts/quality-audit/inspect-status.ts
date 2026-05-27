#!/usr/bin/env tsx
import "dotenv/config";
import { config as loadDotenv } from "dotenv";
import { resolve as resolvePath } from "path";
loadDotenv({ path: resolvePath(process.cwd(), ".env.local"), override: true });
import { prisma } from "@/lib/prisma";

async function main() {
  // Status distintos no banco
  const distinct = await prisma.$queryRaw<Array<{ status: string; cnt: bigint }>>`
    SELECT status, COUNT(*)::bigint as cnt
    FROM conversation_quality_evaluations
    GROUP BY status ORDER BY cnt DESC
  `;
  console.log("Status distintos no banco:");
  for (const r of distinct) console.log(`  ${r.cnt.toString().padStart(5)}  '${r.status}'`);

  // Markers distintos com count, ordenados por data
  const markers = await prisma.$queryRaw<Array<{ title: string; cnt: bigint; first_at: Date }>>`
    SELECT c.title, COUNT(e.id)::bigint as cnt, MIN(c.created_at) as first_at
    FROM conversations c
    JOIN conversation_quality_evaluations e ON e.conversation_id = c.id
    WHERE c.title LIKE '%[AUDIT-%'
    GROUP BY c.title
    ORDER BY MIN(c.created_at) ASC
  `;
  console.log("\nMarkers (cronologico):");
  for (const m of markers) console.log(`  ${m.first_at.toISOString().substring(0, 16)}  ${m.cnt.toString().padStart(4)}  ${m.title.substring(0, 70)}`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
