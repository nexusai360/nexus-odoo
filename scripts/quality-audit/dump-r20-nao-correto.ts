import { config as loadDotenv } from "dotenv";
import { resolve as resolvePath } from "path";
loadDotenv({ path: resolvePath(process.cwd(), ".env.local"), override: true });

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { writeFileSync } from "fs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const MARKER = "[AUDIT-POS-2026-05-27T22-43-15]";

async function main() {
  const evals = await prisma.$queryRaw<
    Array<{
      id: string;
      status: string;
      patterns: string[];
      retry_count: number;
      retry_reason: string | null;
      retry_detail: string | null;
      razoes: string;
      conversation_id: string;
      assistant_message_id: string | null;
      user_message_id: string | null;
    }>
  >`
    SELECT e.id, e.status, e.patterns, e.retry_count, e.retry_reason, e.retry_detail,
           e.razoes, e.conversation_id, e.assistant_message_id, e.user_message_id
    FROM conversation_quality_evaluations e
    JOIN conversations c ON c.id = e.conversation_id
    WHERE c.title LIKE ${"%" + MARKER + "%"}
      AND e.status IN ('ERRADO', 'PARCIAL', 'FORA_DO_ESCOPO')
    ORDER BY e.status, e.created_at
  `;

  console.log(`R20 nao-CORRETO: ${evals.length}`);

  const md: string[] = ["# Auditoria R20 (nao-CORRETO)", "", `Marker: ${MARKER}`, `Total: ${evals.length}`, ""];
  let n = 0;
  for (const ev of evals) {
    n++;
    let pergunta = "";
    let resposta = "";
    let toolCalls: Array<{ name: string; input: unknown; result: unknown }> = [];
    if (ev.user_message_id) {
      const u = await prisma.message.findUnique({ where: { id: ev.user_message_id }, select: { content: true } });
      pergunta = u?.content ?? "";
    }
    if (ev.assistant_message_id) {
      const a = await prisma.message.findUnique({
        where: { id: ev.assistant_message_id },
        select: { content: true, toolCalls: true, toolResults: true },
      });
      resposta = a?.content ?? "";
    }
    // all assistant messages' tool_calls + tool_results for this conversation
    const msgs = await prisma.message.findMany({
      where: { conversationId: ev.conversation_id, role: "assistant" },
      select: { toolCalls: true, toolResults: true },
    });
    for (const m of msgs) {
      const tc = (m.toolCalls as Array<{ name: string; input?: unknown }> | null) ?? [];
      const tr = (m.toolResults as Record<string, unknown> | null) ?? {};
      tc.forEach((c, i) => {
        if (c?.name) {
          toolCalls.push({ name: c.name, input: c.input ?? null, result: tr?.[String(i)] ?? tr?.[c.name] ?? null });
        }
      });
    }
    md.push(`## ${n}. [${ev.status}] ${ev.id.slice(0, 8)}`);
    md.push(`**Pergunta:** ${pergunta || "(vazia)"}`);
    md.push("");
    md.push(`**Resposta:**`);
    md.push("```");
    md.push(resposta || "(vazia)");
    md.push("```");
    md.push(`**Tools (${toolCalls.length}):**`);
    for (const tc of toolCalls) {
      const inp = JSON.stringify(tc.input);
      md.push(`- \`${tc.name}\` input=\`${inp.length > 150 ? inp.slice(0, 150) + "..." : inp}\``);
      const r = JSON.stringify(tc.result);
      if (r) {
        const cut = r.length > 800 ? r.slice(0, 800) + "..." : r;
        md.push(`  result=\`${cut}\``);
      }
    }
    md.push("");
    md.push(`**Retry:** ${ev.retry_count}${ev.retry_reason ? "/" + ev.retry_reason : ""} ${ev.retry_detail ?? ""}`);
    md.push(`**Razoes:** ${ev.razoes}`);
    md.push("");
    md.push("---");
    md.push("");
  }

  writeFileSync("/tmp/r20-nao-correto.md", md.join("\n"));
  console.log("Dump em: /tmp/r20-nao-correto.md");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
