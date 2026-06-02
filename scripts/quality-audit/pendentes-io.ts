#!/usr/bin/env tsx
/**
 * I/O dos pendentes para o juízo feito pelo PRÓPRIO Claude Code (sem GPT).
 * Ver docs/quality-judge-playbook.md.
 *
 *   --dump   -> escreve /tmp/nex-pendentes.json [{id, question, answer, transcript}]
 *   --apply  -> lê /tmp/nex-pendentes-judged.json [{id, status, patterns, razoes}]
 *               e grava status/patterns/razoes (judgeModel="claude-code").
 */
import "./load-env";
import { readFileSync, writeFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";

const DUMP_PATH = "/tmp/nex-pendentes.json";
const JUDGED_PATH = "/tmp/nex-pendentes-judged.json";

const VALID_STATUS = new Set([
  "CORRETO",
  "PARCIAL",
  "ERRADO",
  "FORA_DO_ESCOPO",
  "FALHA_TECNICA",
]);

async function dump(): Promise<void> {
  const rows = await prisma.conversationQualityEvaluation.findMany({
    where: { status: "PENDENTE" },
    select: {
      id: true,
      conversationId: true,
      questionSnapshot: true,
      answerSnapshot: true,
    },
    orderBy: { createdAt: "asc" },
  });
  const out = [];
  for (const r of rows) {
    let transcript = "";
    if (r.conversationId) {
      const msgs = await prisma.$queryRaw<
        Array<{ role: string; content: string }>
      >`
        SELECT role, content FROM messages
        WHERE conversation_id = ${r.conversationId}::uuid AND role IN ('user','assistant')
        ORDER BY created_at ASC LIMIT 10
      `;
      transcript = msgs
        .map((m) => `${m.role === "user" ? "Usuario" : "Nex"}: ${m.content.slice(0, 800)}`)
        .join("\n");
    }
    out.push({
      id: r.id,
      question: r.questionSnapshot ?? "",
      answer: r.answerSnapshot ?? "",
      transcript,
    });
  }
  writeFileSync(DUMP_PATH, JSON.stringify(out, null, 2));
  console.log(`[pendentes] ${out.length} pendentes -> ${DUMP_PATH}`);
}

async function apply(): Promise<void> {
  const judged = JSON.parse(readFileSync(JUDGED_PATH, "utf-8")) as Array<{
    id: string;
    status: string;
    patterns?: string[];
    razoes?: string;
  }>;
  let ok = 0;
  let skip = 0;
  for (const j of judged) {
    if (!j.id || !VALID_STATUS.has(j.status)) {
      skip++;
      continue;
    }
    await prisma.conversationQualityEvaluation.update({
      where: { id: j.id },
      data: {
        status: j.status as never,
        patterns: Array.isArray(j.patterns) ? j.patterns.slice(0, 3) : [],
        razoes: (j.razoes ?? "").slice(0, 600),
        judgeModel: "claude-code",
        judgeVersion: "claude-code-v1",
      },
    });
    ok++;
  }
  console.log(`[pendentes] aplicados ${ok} (ignorados ${skip})`);
}

async function main() {
  const mode = process.argv.includes("--apply") ? "apply" : "dump";
  if (mode === "apply") await apply();
  else await dump();
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error("[pendentes] ERRO:", e);
  process.exit(1);
});
