#!/usr/bin/env tsx
/**
 * I/O da PERÍCIA feita pelo PRÓPRIO Claude Code (Opus), sem GPT nem heurística.
 * Ver docs/quality-judge-playbook.md.
 *
 *   --dump   -> /tmp/nex-pendentes.json com itens PENDENTE + REAVALIAR, cada um
 *               com pergunta, resposta, transcript, toolCalls/toolResults
 *               persistidos e o VOTO+COMENTÁRIO do usuário (quando houver).
 *   --apply  -> lê /tmp/nex-pendentes-judged.json [{id, status, patterns, razoes}]
 *               e grava o veredito. Em itens REAVALIAR, PRESERVA as razões
 *               anteriores e ANEXA uma entrada "[AJUSTE-PERICIA <ts>]" (ajuste
 *               pela perícia de IA). Nunca toca humanStatus.
 *               judgeVersion = "claude-pericia-v1".
 */
import "./load-env";
import { readFileSync, writeFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";

const DUMP_PATH = "/tmp/nex-pendentes.json";
const JUDGED_PATH = "/tmp/nex-pendentes-judged.json";

// Status que o juiz pode CRAVAR (terminais). REAVALIAR/PENDENTE são de entrada,
// nunca saída do juízo.
const VALID_STATUS = new Set([
  "CORRETO",
  "PARCIAL",
  "ERRADO",
  "FORA_DO_ESCOPO",
  "FALHA_TECNICA",
]);

const JUDGE_VERSION = "claude-pericia-v1";

async function dump(): Promise<void> {
  const rows = await prisma.conversationQualityEvaluation.findMany({
    where: { status: { in: ["PENDENTE", "REAVALIAR"] } },
    select: {
      id: true,
      conversationId: true,
      assistantMessageId: true,
      status: true,
      createdAt: true,
      questionSnapshot: true,
      answerSnapshot: true,
      razoes: true,
      model: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const out = [];
  for (const r of rows) {
    // Transcript curto (contexto da conversa).
    let transcript = "";
    if (r.conversationId) {
      const msgs = await prisma.$queryRaw<
        Array<{ role: string; content: string }>
      >`
        SELECT role, content FROM messages
        WHERE conversation_id = ${r.conversationId}::uuid AND role IN ('user','assistant')
        ORDER BY created_at ASC LIMIT 12
      `;
      transcript = msgs
        .map(
          (m) =>
            `${m.role === "user" ? "Usuario" : "Nex"}: ${m.content.slice(0, 800)}`,
        )
        .join("\n");
    }

    // Tool calls/results do TURNO (contexto). Os toolCalls vivem nas mensagens
    // assistant INTERMEDIÁRIas (iterações de tool), não na final que o eval
    // aponta; então agregamos do último 'user' até a assistant final. A perícia
    // NÃO confia neles , deve REFAZER a consulta (ver playbook) , mas eles dizem
    // qual tool e quais args o agente usou, base do rerun-toolcall.
    const toolCalls: unknown[] = [];
    const toolResults: unknown[] = [];
    let userFeedback: { rating: string; comment: string | null } | null = null;
    if (r.assistantMessageId && r.conversationId) {
      const turnMsgs = await prisma.message.findMany({
        where: { conversationId: r.conversationId },
        orderBy: { createdAt: "asc" },
        select: { id: true, role: true, toolCalls: true, toolResults: true },
      });
      const endIdx = turnMsgs.findIndex((m) => m.id === r.assistantMessageId);
      if (endIdx >= 0) {
        let startIdx = 0;
        for (let i = endIdx - 1; i >= 0; i--) {
          if (turnMsgs[i].role === "user") {
            startIdx = i + 1;
            break;
          }
        }
        for (const m of turnMsgs.slice(startIdx, endIdx + 1)) {
          if (m.role !== "assistant") continue;
          if (Array.isArray(m.toolCalls)) toolCalls.push(...m.toolCalls);
          else if (m.toolCalls != null) toolCalls.push(m.toolCalls);
          if (Array.isArray(m.toolResults)) toolResults.push(...m.toolResults);
          else if (m.toolResults != null) toolResults.push(m.toolResults);
        }
      }

      // VOTO + COMENTÁRIO do usuário (perícia ≠ avaliação do usuário, mas na
      // REAVALIAÇÃO a perícia DEVE considerar o que o usuário escreveu).
      const fb = await prisma.messageFeedback.findFirst({
        where: { assistantMessageId: r.assistantMessageId },
        select: { rating: true, comment: true },
        orderBy: { createdAt: "desc" },
      });
      if (fb) userFeedback = { rating: fb.rating, comment: fb.comment };
    }

    out.push({
      id: r.id,
      conversationId: r.conversationId,
      assistantMessageId: r.assistantMessageId,
      status: r.status, // "PENDENTE" ou "REAVALIAR"
      isReavaliacao: r.status === "REAVALIAR",
      createdAt: r.createdAt.toISOString(),
      agentModel: r.model ?? null,
      question: r.questionSnapshot ?? "",
      answer: r.answerSnapshot ?? "",
      transcript,
      toolCalls,
      toolResults,
      userFeedback,
      priorRazoes: r.razoes ?? "",
    });
  }
  writeFileSync(DUMP_PATH, JSON.stringify(out, null, 2));
  console.log(
    `[pericia] ${out.length} itens (PENDENTE+REAVALIAR) -> ${DUMP_PATH}`,
  );
}

function nowStamp(): string {
  // Date é permitido em script tsx (diferente do runtime de Workflow).
  return new Date().toISOString().slice(0, 19).replace("T", " ");
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
    // Lê o estado atual: só toca PENDENTE/REAVALIAR e respeita ajuste humano.
    const cur = await prisma.conversationQualityEvaluation.findUnique({
      where: { id: j.id },
      select: { status: true, razoes: true, humanStatus: true },
    });
    if (!cur || (cur.status !== "PENDENTE" && cur.status !== "REAVALIAR")) {
      skip++;
      continue;
    }
    // D3: ajuste humano vence , a perícia nunca sobrescreve decisão do super_admin.
    if (cur.humanStatus) {
      skip++;
      continue;
    }

    const novaRazao = (j.razoes ?? "").slice(0, 600);
    let razoes: string;
    if (cur.status === "REAVALIAR") {
      // Preserva o histórico e anexa o ajuste pela perícia (D5).
      const linha = `[AJUSTE-PERICIA ${nowStamp()}] ${novaRazao}`;
      razoes = `${cur.razoes ?? ""}\n${linha}`.trim().slice(0, 1500);
    } else {
      razoes = novaRazao;
    }

    await prisma.conversationQualityEvaluation.update({
      where: { id: j.id },
      data: {
        status: j.status as never,
        patterns: Array.isArray(j.patterns) ? j.patterns.slice(0, 3) : [],
        razoes,
        judgeModel: "claude-code",
        judgeVersion: JUDGE_VERSION,
      },
    });
    ok++;
  }
  console.log(`[pericia] aplicados ${ok} (ignorados ${skip})`);
}

async function main() {
  const mode = process.argv.includes("--apply") ? "apply" : "dump";
  if (mode === "apply") await apply();
  else await dump();
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error("[pericia] ERRO:", e);
  process.exit(1);
});
