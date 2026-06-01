#!/usr/bin/env tsx
/**
 * Re-roda APENAS as perguntas que falharam (ok=false) no batch da R24, sob o
 * MESMO marker, e mescla no resumo. Usado após recarga de quota OpenAI.
 *   npx tsx scripts/quality-audit/03b-rerun-failed.ts
 */
import "./load-env";
import { config as loadDotenv } from "dotenv";
import { resolve as resolvePath } from "path";
loadDotenv({ path: resolvePath(process.cwd(), ".env.local"), override: true });
import { readFileSync, writeFileSync } from "fs";
import { prisma } from "@/lib/prisma";
import { runAgent } from "@/lib/agent/run-agent";

const MARKER = "[AUDIT-POS-2026-05-31T18-18-13]";
const SUMMARY = resolvePath(process.cwd(), "docs/agent-quality-review/POS-MUDANCAS-EXECUCAO.json");
const CONCURRENCY = 3;

interface Res { conversationId: string; question: string; responseChars: number; ok: boolean; error?: string; durationMs: number }

async function runQuestion(userId: string, question: string): Promise<Res> {
  const t0 = Date.now();
  const conv = await prisma.conversation.create({
    data: { userId, channel: "in_app", title: `${MARKER} ${question.slice(0, 80)}` },
    select: { id: true },
  });
  try {
    const r = await runAgent({ conversationId: conv.id, userId, userMessage: question, channel: "in_app", isPlayground: false });
    return { conversationId: conv.id, question, responseChars: r.ok ? r.message.length : 0, ok: r.ok, error: r.ok ? undefined : "agent_failed", durationMs: Date.now() - t0 };
  } catch (err) {
    return { conversationId: conv.id, question, responseChars: 0, ok: false, error: err instanceof Error ? err.message : String(err), durationMs: Date.now() - t0 };
  }
}

async function pool<T, R>(items: T[], n: number, fn: (i: T) => Promise<R>, onDone: (d: number, t: number, r: R) => void): Promise<R[]> {
  const out: R[] = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (true) { const i = next++; if (i >= items.length) return; out[i] = await fn(items[i]); onDone(i + 1, items.length, out[i]); }
  }));
  return out;
}

async function main() {
  const summary = JSON.parse(readFileSync(SUMMARY, "utf8"));
  const failed: Res[] = summary.results.filter((r: Res) => !r.ok);
  console.log(`[rerun] ${failed.length} perguntas falhadas para re-rodar sob ${MARKER}`);

  const user = await prisma.user.findFirst({ where: { platformRole: "super_admin", isActive: true }, select: { id: true, email: true } });
  if (!user) { console.error("[rerun] super_admin nao encontrado"); process.exit(1); }
  console.log(`[rerun] usuario: ${user.email}`);

  const novos = await pool(failed, CONCURRENCY, (r) => runQuestion(user.id, r.question), (d, t, r) => {
    console.log(`[rerun] ${d}/${t} ${r.ok ? "OK" : "FAIL"} ${r.durationMs}ms · ${r.question.slice(0, 50)}`);
  });

  // Mescla: substitui no summary cada falhado pelo novo resultado (por pergunta).
  const novoPorQ = new Map(novos.map((n) => [n.question, n]));
  summary.results = summary.results.map((r: Res) => (!r.ok && novoPorQ.has(r.question) ? novoPorQ.get(r.question)! : r));
  summary.ok = summary.results.filter((r: Res) => r.ok).length;
  summary.fail = summary.results.filter((r: Res) => !r.ok).length;
  summary.rerunAt = new Date().toISOString();
  writeFileSync(SUMMARY, JSON.stringify(summary, null, 2));
  const okNovos = novos.filter((n) => n.ok).length;
  console.log(`[rerun] concluido. re-rodadas=${novos.length} ok_novos=${okNovos} | TOTAL agora ok=${summary.ok} fail=${summary.fail}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error("[rerun] FATAL:", e?.message ?? e); process.exit(1); });
