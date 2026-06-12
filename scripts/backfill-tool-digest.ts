/**
 * scripts/backfill-tool-digest.ts , Onda M (Arquitetura 3.0) T1.4.
 *
 * Preenche Message.toolDigest retroativamente a partir de toolResults
 * (que ja eram persistidos) + toolCalls. Lotes pequenos, idempotente:
 * so toca linhas com tool_results e sem tool_digest.
 *
 * Uso: npx tsx --env-file=.env.local scripts/backfill-tool-digest.ts
 */
import { prisma } from "@/lib/prisma";
import { derivarToolDigest } from "@/lib/agent/memoria/tool-digest";
import type { ToolCall } from "@/lib/agent/llm/types";

const LOTE = 500;

async function main() {
  let total = 0;
  for (;;) {
    const lote = await prisma.message.findMany({
      where: { toolResults: { not: { equals: null } }, toolDigest: null },
      select: { id: true, toolCalls: true, toolResults: true },
      take: LOTE,
    });
    if (lote.length === 0) break;
    for (const m of lote) {
      const calls = (m.toolCalls as unknown as ToolCall[] | null) ?? [];
      const results = (m.toolResults as Record<string, string> | null) ?? {};
      const digest = derivarToolDigest(calls, results) ?? "";
      await prisma.message.update({
        where: { id: m.id },
        // digest vazio vira string vazia (nao-null) para nao re-selecionar a linha
        data: { toolDigest: digest },
      });
      total++;
    }
    console.log(`[backfill] ${total} mensagens processadas...`);
  }
  console.log(`[backfill] concluido: ${total} mensagens.`);
  await prisma.$disconnect();
  process.exit(0);
}
main();
