// scripts/flywheel-golden.ts
// Onda P (Arquitetura 3.0) P.5 , flywheel MANUAL: minera falhas reais de
// producao e gera a fila de candidatos a caso golden para revisao.
//
// Fontes (janela --dias, default 7):
//   1. ConversationQualityEvaluation com status ruim (ERRADO/PARCIAL/
//      FALHA_TECNICA; humanStatus sobrepoe quando presente);
//   2. MessageFeedback do usuario com rating ERRADO/ALUCINOU/PARCIAL;
//   3. Quality evals com retryReason (validador disparou em producao).
//
// Saida: docs/superpowers/research/flywheel/candidatos-<data>.json.
// Processo manual: humano/Claude revisa cada candidato, preenche dominio/
// toolEsperada/kpiOuro e move para src/lib/agent/evals/golden/golden-nex.json.
// Automacao total so depois de o processo provar taxa de candidatos uteis.
//
// Uso:  npx tsx scripts/flywheel-golden.ts [--dias 7]

import { prisma } from "@/lib/prisma";
import {
  montarCandidatosGolden,
  type FalhaProducao,
} from "@/lib/agent/quality/flywheel";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const STATUS_RUINS = ["ERRADO", "PARCIAL", "FALHA_TECNICA"];
const RATINGS_RUINS = ["ERRADO", "ALUCINOU", "PARCIAL"] as const;

function arg(nome: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function main() {
  const dias = Number(arg("dias", "7"));
  const desde = new Date(Date.now() - dias * 24 * 3600 * 1000);
  const falhas: FalhaProducao[] = [];

  // 1+3) Quality evals ruins OU com retry do validador.
  const evals = await prisma.conversationQualityEvaluation.findMany({
    where: {
      createdAt: { gte: desde },
      OR: [
        { humanStatus: { in: STATUS_RUINS } },
        { humanStatus: null, status: { in: STATUS_RUINS } },
        { retryReason: { not: null } },
      ],
    },
    select: {
      conversationId: true,
      status: true,
      humanStatus: true,
      razoes: true,
      retryReason: true,
      questionSnapshot: true,
      answerSnapshot: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  for (const e of evals) {
    if (!e.questionSnapshot) continue;
    const statusFinal = e.humanStatus ?? e.status;
    const ehRuim = STATUS_RUINS.includes(statusFinal);
    falhas.push({
      origem: ehRuim ? "quality_eval" : "validador_retry",
      conversationId: e.conversationId,
      pergunta: e.questionSnapshot,
      resposta: (e.answerSnapshot ?? "").slice(0, 600),
      motivo: ehRuim
        ? `${statusFinal}: ${e.razoes.slice(0, 200)}`
        : `retry ${e.retryReason}`,
      criadoEm: e.createdAt.toISOString(),
    });
  }

  // 2) Feedback negativo do usuario (a pergunta vem da mensagem anterior).
  const feedbacks = await prisma.messageFeedback.findMany({
    where: { createdAt: { gte: desde }, rating: { in: [...RATINGS_RUINS] } },
    select: {
      conversationId: true,
      assistantMessageId: true,
      rating: true,
      comment: true,
      createdAt: true,
    },
    take: 200,
  });
  for (const f of feedbacks) {
    const assistant = await prisma.message.findUnique({
      where: { id: f.assistantMessageId },
      select: { content: true, createdAt: true },
    });
    if (!assistant) continue;
    const userMsg = await prisma.message.findFirst({
      where: {
        conversationId: f.conversationId,
        role: "user",
        createdAt: { lt: assistant.createdAt },
      },
      orderBy: { createdAt: "desc" },
      select: { content: true },
    });
    if (!userMsg) continue;
    falhas.push({
      origem: "feedback_usuario",
      conversationId: f.conversationId,
      pergunta: userMsg.content,
      resposta: assistant.content.slice(0, 600),
      motivo: `${f.rating}${f.comment ? `: ${f.comment}` : ""}`,
      criadoEm: f.createdAt.toISOString(),
    });
  }

  // Golden atual (para nao propor caso ja coberto).
  const golden = JSON.parse(
    readFileSync(
      join(process.cwd(), "src/lib/agent/evals/golden/golden-nex.json"),
      "utf8",
    ),
  ) as { pergunta: string }[];

  const candidatos = montarCandidatosGolden(
    falhas,
    golden.map((g) => g.pergunta),
  );

  const outDir = join(process.cwd(), "docs/superpowers/research/flywheel");
  mkdirSync(outDir, { recursive: true });
  const data = new Date().toISOString().slice(0, 10);
  const outPath = join(outDir, `candidatos-${data}.json`);
  writeFileSync(outPath, JSON.stringify({ geradoEm: new Date().toISOString(), dias, totalFalhas: falhas.length, candidatos }, null, 2));

  console.log(
    `[flywheel] ${falhas.length} falhas (janela ${dias}d) -> ${candidatos.length} candidatos dedupados`,
  );
  console.log(`[flywheel] fila para revisao: ${outPath}`);
  for (const c of candidatos.slice(0, 10)) {
    console.log(`  - (${c.motivos.length} sinais) ${c.pergunta.slice(0, 90)}`);
  }
  await prisma.$disconnect();
  setTimeout(() => process.exit(0), 200);
}

main().catch((e) => {
  console.error("[flywheel] FATAL:", e);
  process.exit(1);
});
