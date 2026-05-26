#!/usr/bin/env tsx
/**
 * CLI: pnpm tsx scripts/analyze-conversations.ts [--sample 0.05] [--max-cost-usd 50] [--judge-model <id>]
 *
 * Roda analise retrospectiva sobre uma amostra estratificada de turnos
 * (assistant messages com tool_calls). Persiste rubrica do juiz em
 * `conversation_quality_evaluations`. Ao final, chama clusterer.
 *
 * Amostragem (spec §3.2.2):
 *  - Particiona turnos em buckets (topicTagPrimario, modelo, era).
 *  - era: "pre_instrument" (sem tool_results) | "post_instrument".
 *  - bucketSample = clamp(ceil(bucket.size * sample), 1, 200).
 *  - Mistura 50/50 entre eras.
 *
 * Cap por execucao via --max-cost-usd; pausa interativa ao atingir.
 *
 * Spec: docs/superpowers/specs/2026-05-25-agente-nex-inteligencia-design.md §3
 * Plan: T2.6 do PLAN v3.
 */

import "dotenv/config";
import { prisma } from "@/lib/prisma";
import {
  normalizeToolHistory,
  replayToolCalls,
  judgeAnswer,
  clusterRecommendations,
  JUDGE_VERSION,
} from "@/lib/agent/intelligence";

interface Args {
  sample: number;
  maxCostUsd: number;
  judgeModel?: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { sample: 0.05, maxCostUsd: 50, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--sample") args.sample = parseFloat(argv[++i] ?? "0.05");
    else if (a === "--max-cost-usd") args.maxCostUsd = parseFloat(argv[++i] ?? "50");
    else if (a === "--judge-model") args.judgeModel = argv[++i];
    else if (a === "--dry-run") args.dryRun = true;
  }
  return args;
}

type TurnRow = {
  id: string;
  conversationId: string;
  content: string;
  toolCalls: unknown;
  toolResults: unknown;
  conversation: {
    id: string;
    topicTags: string[];
  } | null;
};

async function loadTurns(): Promise<TurnRow[]> {
  // Pega assistant messages com toolCalls (i.e., turnos de tool execution
  // que produziram resposta).
  return prisma.message.findMany({
    where: {
      role: "assistant",
      toolCalls: { not: null as unknown as undefined },
    },
    select: {
      id: true,
      conversationId: true,
      content: true,
      toolCalls: true,
      toolResults: true,
      conversation: { select: { id: true, topicTags: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

function bucketKey(t: TurnRow): string {
  const topic = t.conversation?.topicTags?.[0] ?? "unknown";
  const era = t.toolResults ? "post_instrument" : "pre_instrument";
  return `${era}|${topic}`;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function stratify(turns: TurnRow[], sampleRatio: number): TurnRow[] {
  const buckets = new Map<string, TurnRow[]>();
  for (const t of turns) {
    const key = bucketKey(t);
    const list = buckets.get(key) ?? [];
    list.push(t);
    buckets.set(key, list);
  }

  const sample: TurnRow[] = [];
  for (const [, list] of buckets) {
    const n = Math.min(Math.max(Math.ceil(list.length * sampleRatio), 1), 200);
    sample.push(...shuffle(list).slice(0, n));
  }

  // 50/50 entre eras.
  const post = sample.filter((t) => t.toolResults != null);
  const pre = sample.filter((t) => t.toolResults == null);
  const target = Math.min(post.length, pre.length);
  if (target === 0) {
    // So uma era disponivel — devolve tudo.
    return sample;
  }
  return [
    ...shuffle(post).slice(0, target),
    ...shuffle(pre).slice(0, target),
  ];
}

async function findUserMessageBefore(
  conversationId: string,
  beforeAssistantMessageId: string,
): Promise<string | null> {
  const assistantMsg = await prisma.message.findUnique({
    where: { id: beforeAssistantMessageId },
    select: { createdAt: true },
  });
  if (!assistantMsg) return null;
  const user = await prisma.message.findFirst({
    where: {
      conversationId,
      role: "user",
      createdAt: { lt: assistantMsg.createdAt },
    },
    orderBy: { createdAt: "desc" },
    select: { content: true },
  });
  return user?.content ?? null;
}

async function findFinalAssistant(
  conversationId: string,
  fromMessageId: string,
): Promise<string | null> {
  // Procura a primeira mensagem assistant SEM toolCalls (resposta final)
  // depois do fromMessageId. Usado para casos onde o turno avaliado e
  // um "step" intermediario de tool call.
  const fromMsg = await prisma.message.findUnique({
    where: { id: fromMessageId },
    select: { createdAt: true, toolCalls: true },
  });
  if (!fromMsg) return null;
  const tc = fromMsg.toolCalls;
  if (tc == null || (Array.isArray(tc) && tc.length === 0)) {
    return null; // ja e o final
  }
  const next = await prisma.message.findFirst({
    where: {
      conversationId,
      role: "assistant",
      createdAt: { gt: fromMsg.createdAt },
      OR: [{ toolCalls: { equals: null as unknown as undefined } }],
    },
    orderBy: { createdAt: "asc" },
    select: { content: true },
  });
  return next?.content ?? null;
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(`[analyze] sample=${args.sample} maxCostUsd=${args.maxCostUsd}`);

  const turns = await loadTurns();
  console.log(`[analyze] total de turnos disponiveis: ${turns.length}`);
  if (turns.length === 0) {
    console.log("[analyze] nada a analisar.");
    return;
  }

  const sample = stratify(turns, args.sample);
  console.log(`[analyze] amostra selecionada: ${sample.length}`);
  console.log(
    `[analyze]   pre_instrument=${sample.filter((t) => t.toolResults == null).length}` +
      ` · post_instrument=${sample.filter((t) => t.toolResults != null).length}`,
  );

  if (args.dryRun) {
    console.log("[analyze] dry-run; nao chamando juiz.");
    return;
  }

  let accumulatedCostUsd = 0;
  const ESTIMATED_COST_PER_TURN = 0.02; // Gemini 2.5 Pro thinking; ajuste se trocar modelo
  let processed = 0;
  let saved = 0;
  let skipped = 0;
  const startedAt = Date.now();

  for (const turn of sample) {
    if (accumulatedCostUsd + ESTIMATED_COST_PER_TURN > args.maxCostUsd) {
      console.log(
        `[analyze] cap de custo atingido ($${accumulatedCostUsd.toFixed(2)} de $${args.maxCostUsd}). Pause manual recomendada.`,
      );
      break;
    }

    // Idempotencia: ja existe avaliacao desse assistantMessageId?
    const exists = await prisma.conversationQualityEvaluation.findUnique({
      where: { assistantMessageId: turn.id },
      select: { id: true },
    });
    if (exists) {
      skipped++;
      continue;
    }

    const userMessage = await findUserMessageBefore(turn.conversationId, turn.id);
    if (!userMessage) {
      skipped++;
      continue;
    }

    // Se o turno tem toolCalls, content do assistant pode ser vazio (so foi
    // chamado de tool). Pega a resposta final.
    let assistantFinal = turn.content;
    if (!assistantFinal || assistantFinal.trim().length === 0) {
      const next = await findFinalAssistant(turn.conversationId, turn.id);
      assistantFinal = next ?? "";
    }
    if (!assistantFinal.trim()) {
      skipped++;
      continue;
    }

    const history = normalizeToolHistory(turn.toolCalls, turn.toolResults);
    const originalResultMissing = history.length > 0 && history.every((h) => h.result == null);

    // Replay (read-only) — alimenta divergence + novos resultados.
    const replay = await replayToolCalls(history, "quality-judge");

    // Judge.
    const judgement = await judgeAnswer({
      userMessage,
      assistantMessage: assistantFinal,
      replay: replay.items,
      originalResultMissing,
    });

    if (judgement.flags.includes("judge_unavailable")) {
      console.warn("[analyze] judge indisponivel — abortando.");
      break;
    }

    // Persist.
    await prisma.conversationQualityEvaluation.create({
      data: {
        conversationId: turn.conversationId,
        assistantMessageId: turn.id,
        judgeModel: judgement.judgeModel,
        judgeVersion: judgement.judgeVersion || JUDGE_VERSION,
        aderencia: judgement.aderencia,
        correcaoFactual: judgement.correcaoFactual,
        escolhaDeTools: judgement.escolhaDeTools,
        clareza: judgement.clareza,
        razoes: judgement.razoes,
        recomendacaoPrompt: judgement.recomendacaoPrompt,
        toolsReexecuted: JSON.parse(JSON.stringify({ items: replay.items })),
        flags: judgement.flags,
      },
    });

    accumulatedCostUsd += ESTIMATED_COST_PER_TURN;
    saved++;
    processed++;
    if (processed % 10 === 0) {
      console.log(
        `[analyze] ${processed}/${sample.length} ; custo ~ $${accumulatedCostUsd.toFixed(2)}`,
      );
    }
  }

  console.log(
    `[analyze] concluido. saved=${saved} skipped=${skipped} elapsed=${Math.round(
      (Date.now() - startedAt) / 1000,
    )}s custo ~ $${accumulatedCostUsd.toFixed(2)}`,
  );

  console.log("[analyze] clusterizando recomendacoes...");
  const clusters = await clusterRecommendations();
  console.log(`[analyze] clusters: ${clusters.length}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("[analyze] erro:", err);
    process.exit(1);
  },
);
