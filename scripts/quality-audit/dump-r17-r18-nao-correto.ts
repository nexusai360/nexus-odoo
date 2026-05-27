/**
 * Dump dos 48 turnos nao-CORRETO de R17+R18 com pergunta, resposta,
 * tool calls (com input) e tool results (envelope completo) para auditoria
 * manual turno-a-turno.
 *
 * Output: /tmp/r17-r18-nao-correto.json (estrutura serializada)
 *         /tmp/r17-r18-nao-correto.md   (legivel para audit por leitura)
 */
import "dotenv/config";
import { config as loadDotenv } from "dotenv";
import { resolve as resolvePath } from "path";
loadDotenv({ path: resolvePath(process.cwd(), ".env.local"), override: true });

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { writeFileSync } from "fs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const MARKERS = {
  R17: "[AUDIT-POS-2026-05-27T15-10-40]",
  R18: "[AUDIT-POS-2026-05-27T16-16-15]",
};

type DumpItem = {
  evalId: string;
  rodada: "R17" | "R18";
  status: string;
  patterns: string[];
  retryCount: number;
  retryReason: string | null;
  retryDetail: string | null;
  razoes: string;
  pergunta: string;
  resposta: string;
  toolCalls: Array<{ name: string; input: unknown; result: unknown }>;
};

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
      title: string;
    }>
  >`
    SELECT e.id,
           e.status,
           e.patterns,
           e.retry_count,
           e.retry_reason,
           e.retry_detail,
           e.razoes,
           e.conversation_id,
           e.assistant_message_id,
           e.user_message_id,
           c.title
    FROM conversation_quality_evaluations e
    JOIN conversations c ON c.id = e.conversation_id
    WHERE (c.title LIKE ${"%" + MARKERS.R17 + "%"} OR c.title LIKE ${"%" + MARKERS.R18 + "%"})
      AND e.status IN ('ERRADO', 'PARCIAL', 'FORA_DO_ESCOPO')
    ORDER BY c.title, e.created_at
  `;

  console.log(`Encontrados ${evals.length} evals nao-CORRETO.`);

  const items: DumpItem[] = [];

  for (const ev of evals) {
    const rodada = ev.title.includes(MARKERS.R17) ? "R17" : "R18";

    let pergunta = "";
    let resposta = "";
    let toolCalls: DumpItem["toolCalls"] = [];

    if (ev.user_message_id) {
      const u = await prisma.message.findUnique({
        where: { id: ev.user_message_id },
        select: { content: true },
      });
      pergunta = u?.content ?? "";
    }

    if (ev.assistant_message_id) {
      const a = await prisma.message.findUnique({
        where: { id: ev.assistant_message_id },
        select: { content: true, toolCalls: true, toolResults: true },
      });
      resposta = a?.content ?? "";
      const tcRaw = (a?.toolCalls as Array<{ name: string; input?: unknown }> | null) ?? [];
      const trRaw = (a?.toolResults as Record<string, unknown> | null) ?? {};
      toolCalls = tcRaw.map((tc, idx) => ({
        name: tc.name,
        input: tc.input ?? null,
        result: trRaw?.[String(idx)] ?? trRaw?.[tc.name] ?? null,
      }));
    }

    items.push({
      evalId: ev.id,
      rodada: rodada as "R17" | "R18",
      status: ev.status,
      patterns: ev.patterns ?? [],
      retryCount: ev.retry_count,
      retryReason: ev.retry_reason,
      retryDetail: ev.retry_detail,
      razoes: ev.razoes,
      pergunta,
      resposta,
      toolCalls,
    });
  }

  writeFileSync("/tmp/r17-r18-nao-correto.json", JSON.stringify(items, null, 2));

  // Markdown legivel
  const md: string[] = [
    "# Auditoria manual R17+R18 (nao-CORRETO)",
    "",
    `Total: ${items.length} turnos`,
    "",
  ];

  let n = 0;
  for (const it of items) {
    n++;
    md.push(`## ${n}. [${it.rodada}/${it.status}] ${it.evalId.slice(0, 8)}`);
    md.push("");
    md.push(`**Pergunta:** ${it.pergunta || "(vazia)"}`);
    md.push("");
    md.push(`**Resposta:**`);
    md.push("```");
    md.push(it.resposta || "(vazia)");
    md.push("```");
    md.push("");
    md.push(`**Tools (${it.toolCalls.length}):**`);
    for (const tc of it.toolCalls) {
      const inp = JSON.stringify(tc.input);
      md.push(`- \`${tc.name}\` input=\`${inp.length > 200 ? inp.slice(0, 200) + "..." : inp}\``);
      const resStr = JSON.stringify(tc.result);
      if (resStr) {
        const cut = resStr.length > 1500 ? resStr.slice(0, 1500) + "..." : resStr;
        md.push(`  result=\`${cut}\``);
      } else {
        md.push(`  result=null`);
      }
    }
    md.push("");
    md.push(
      `**Heuristica:** status=${it.status} patterns=[${it.patterns.join(", ")}] retry=${it.retryCount}${it.retryReason ? "/" + it.retryReason : ""}`,
    );
    md.push("");
    md.push(`**Razoes:** ${it.razoes}`);
    md.push("");
    md.push("---");
    md.push("");
  }

  writeFileSync("/tmp/r17-r18-nao-correto.md", md.join("\n"));

  console.log("Dump em:");
  console.log("  /tmp/r17-r18-nao-correto.json");
  console.log("  /tmp/r17-r18-nao-correto.md");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
