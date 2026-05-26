#!/usr/bin/env tsx
/**
 * Estagio 4 da auditoria: dispara N perguntas reais contra o agente em
 * producao (gpt-5.4-nano) para medir o impacto das mudancas aplicadas.
 *
 * Importante:
 * - Usa a credencial ATIVA do LlmConfig (sem trocar de modelo).
 * - Cria 1 conversa nova POR pergunta (in-app channel) com um marcador no
 *   titulo: "[AUDIT-POS-MUDANCAS-<timestamp>]" — facilita filtrar depois.
 * - Captura: pergunta, tool_calls, tool_results (agora gravados pela Onda 1
 *   do schema), resposta final, tokens.
 *
 * CLI:
 *   pnpm tsx scripts/quality-audit/03-run-test-questions.ts [--limit 300] [--concurrency 5]
 */

import { config as loadDotenv } from "dotenv";
import { resolve as resolvePath } from "path";
loadDotenv({ path: resolvePath(process.cwd(), ".env.local"), override: true });

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { prisma } from "@/lib/prisma";
import { runAgent } from "@/lib/agent/run-agent";

interface Args {
  limit: number;
  concurrency: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { limit: 300, concurrency: 5 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") args.limit = parseInt(argv[++i] ?? "300", 10);
    else if (a === "--concurrency") args.concurrency = parseInt(argv[++i] ?? "5", 10);
  }
  return args;
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function loadQuestions(limit: number): Array<{ domain: string; question: string }> {
  const path = resolve(process.cwd(), "scripts/quality-audit/test-questions.json");
  const raw = JSON.parse(readFileSync(path, "utf-8")) as Record<string, string[]>;
  const all: Array<{ domain: string; question: string }> = [];
  for (const [domain, questions] of Object.entries(raw)) {
    for (const q of questions) all.push({ domain, question: q });
  }
  return shuffle(all).slice(0, limit);
}

async function findTestUser(): Promise<{ id: string; email: string } | null> {
  const u = await prisma.user.findFirst({
    where: { platformRole: "super_admin", isActive: true },
    select: { id: true, email: true },
  });
  return u;
}

async function runQuestion(
  userId: string,
  question: string,
  marker: string,
): Promise<{
  conversationId: string;
  question: string;
  responseChars: number;
  ok: boolean;
  error?: string;
  durationMs: number;
}> {
  const t0 = Date.now();
  // Cria conversa nova in-app com titulo marcado.
  const conv = await prisma.conversation.create({
    data: {
      userId,
      channel: "in_app",
      title: `${marker} ${question.slice(0, 80)}`,
    },
    select: { id: true },
  });

  try {
    const result = await runAgent({
      conversationId: conv.id,
      userId,
      userMessage: question,
      channel: "in_app",
      isPlayground: false,
    });

    return {
      conversationId: conv.id,
      question,
      responseChars: result.ok ? result.message.length : 0,
      ok: result.ok,
      error: result.ok ? undefined : "agent_failed",
      durationMs: Date.now() - t0,
    };
  } catch (err) {
    return {
      conversationId: conv.id,
      question,
      responseChars: 0,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - t0,
    };
  }
}

async function pool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<R>,
  onDone?: (idx: number, total: number, r: R) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      const r = await fn(items[i], i);
      results[i] = r;
      onDone?.(i + 1, items.length, r);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(`[test] limit=${args.limit} concurrency=${args.concurrency}`);

  const user = await findTestUser();
  if (!user) {
    console.error("[test] usuario super_admin nao encontrado");
    process.exit(1);
  }
  console.log(`[test] usuario: ${user.email} (id=${user.id})`);

  const questions = loadQuestions(args.limit);
  console.log(`[test] ${questions.length} perguntas carregadas (de ~300 disponiveis)`);

  const marker = `[AUDIT-POS-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}]`;
  console.log(`[test] marker do batch: ${marker}`);
  console.log(`[test] iniciando disparos...`);

  const startedAt = Date.now();
  const results = await pool(
    questions,
    args.concurrency,
    async (q) => runQuestion(user.id, q.question, marker),
    (done, total, r) => {
      const sym = r.ok ? "OK" : "FAIL";
      console.log(
        `[test] ${done}/${total} ${sym} ${r.durationMs}ms · ${r.question.slice(0, 60)}`,
      );
    },
  );

  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  const ok = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  console.log(`[test] concluido em ${elapsed}s. ok=${ok} fail=${fail}`);

  // Salva resumo da execucao em disco.
  const outDir = resolve(process.cwd(), "docs/agent-quality-review");
  const summary = {
    marker,
    startedAt: new Date(startedAt).toISOString(),
    elapsedSeconds: elapsed,
    total: results.length,
    ok,
    fail,
    results,
  };
  writeFileSync(
    resolve(outDir, "POS-MUDANCAS-EXECUCAO.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(`[test] resumo gravado em docs/agent-quality-review/POS-MUDANCAS-EXECUCAO.json`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[test] erro:", err);
  process.exit(1);
});
