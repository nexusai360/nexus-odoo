#!/usr/bin/env tsx
/**
 * Estagio 1 do fluxo de auditoria on-demand: extrai turnos PENDENTES
 * da tabela ConversationQualityEvaluation e gera batch JSON pro Claude
 * Code avaliar.
 *
 * Spec: docs/superpowers/specs/2026-05-26-agente-qualidade-design.md §5.5
 *
 * CLI:
 *   pnpm tsx scripts/quality-audit/dump-pending.ts [--limit 40] [--include-evaluated] [--out PATH]
 *
 * Output JSON format (compativel com batches R4/R5):
 * {
 *   "generatedAt": "2026-05-26T...",
 *   "count": N,
 *   "turnos": [
 *     {
 *       "evaluationId": "...",
 *       "turnoId": "...",
 *       "conversationId": "...",
 *       "userMessageId": "...",
 *       "assistantMessageId": "...",
 *       "userMessage": "...",
 *       "toolCalls": [...],
 *       "toolResults": {...},
 *       "finalMessage": "...",
 *       "model": "gpt-5.4-nano",
 *       "createdAt": "..."
 *     }
 *   ]
 * }
 */

// Primeiro import: carrega .env.local antes de @/lib/prisma (ver load-env.ts).
import "./load-env";
import "dotenv/config";
import { config as loadDotenv } from "dotenv";
import { resolve as resolvePath } from "path";
loadDotenv({ path: resolvePath(process.cwd(), ".env.local"), override: true });

import { writeFileSync } from "fs";
import { resolve } from "path";
import { prisma } from "@/lib/prisma";

interface Args {
  limit: number;
  includeEvaluated: boolean;
  out: string | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { limit: 40, includeEvaluated: false, out: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") args.limit = parseInt(argv[++i] ?? "40", 10);
    else if (a === "--include-evaluated") args.includeEvaluated = true;
    else if (a === "--out") args.out = argv[++i] ?? null;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(
    `[dump-pending] limit=${args.limit} include-evaluated=${args.includeEvaluated}`,
  );

  const where = args.includeEvaluated ? {} : { status: "PENDENTE" as const };

  const evals = await prisma.conversationQualityEvaluation.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: args.limit,
    select: {
      id: true,
      conversationId: true,
      userMessageId: true,
      assistantMessageId: true,
      questionSnapshot: true,
      answerSnapshot: true,
      model: true,
      createdAt: true,
    },
  });

  if (evals.length === 0) {
    console.log("[dump-pending] Nenhum turno pendente. Nada a avaliar.");
    process.exit(0);
  }

  const turnos = await Promise.all(
    evals.map(async (e) => {
      let toolCalls: unknown = null;
      let toolResults: unknown = null;
      // BUG FIX: agrega tools de TODAS as assistant messages do turno
      // (intermediarias tem tools, final nao tem).
      if (e.assistantMessageId) {
        const finalMsg = await prisma.message.findUnique({
          where: { id: e.assistantMessageId },
          select: { createdAt: true, conversationId: true },
        });
        if (finalMsg) {
          const lastUser = await prisma.message.findFirst({
            where: {
              conversationId: finalMsg.conversationId,
              role: "user",
              createdAt: { lt: finalMsg.createdAt },
            },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
          });
          const assistants = await prisma.message.findMany({
            where: {
              conversationId: finalMsg.conversationId,
              role: "assistant",
              createdAt: {
                ...(lastUser ? { gt: lastUser.createdAt } : {}),
                lte: finalMsg.createdAt,
              },
            },
            orderBy: { createdAt: "asc" },
            select: { toolCalls: true, toolResults: true },
          });
          const calls: unknown[] = [];
          const results: unknown[] = [];
          for (const m of assistants) {
            if (Array.isArray(m.toolCalls)) calls.push(...(m.toolCalls as unknown[]));
            else if (m.toolCalls != null) calls.push(m.toolCalls);
            if (Array.isArray(m.toolResults)) results.push(...(m.toolResults as unknown[]));
            else if (m.toolResults != null) results.push(m.toolResults);
          }
          toolCalls = calls.length > 0 ? calls : null;
          toolResults = results.length > 0 ? results : null;
        }
      }
      return {
        evaluationId: e.id,
        turnoId: e.assistantMessageId ?? e.id,
        conversationId: e.conversationId,
        userMessageId: e.userMessageId,
        assistantMessageId: e.assistantMessageId,
        userMessage: e.questionSnapshot ?? "",
        toolCalls,
        toolResults,
        finalMessage: e.answerSnapshot ?? "",
        model: e.model ?? "unknown",
        createdAt: e.createdAt.toISOString(),
      };
    }),
  );

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const out =
    args.out ?? resolve(process.cwd(), `/tmp/quality-audit-pending-${ts}.json`);

  writeFileSync(
    out,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), count: turnos.length, turnos },
      null,
      2,
    ),
  );

  console.log(`[dump-pending] ${turnos.length} turnos em ${out}`);
  console.log(`Cole o path acima na proxima mensagem pra eu avaliar.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[dump-pending] erro:", err);
  process.exit(1);
});
