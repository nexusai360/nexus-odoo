#!/usr/bin/env tsx
/**
 * Estagio 1 da auditoria: extrai turnos do banco e grava em batches JSON.
 *
 * Spec: docs/agent-quality-review/AUDIT-SPEC.md
 *
 * Estrutura de um turno:
 *   user_message -> assistant_with_tools (toolCalls) -> assistant_final
 * (algumas conversas tem multiplos turnos; aqui cada turno final vira 1 entrada)
 *
 * Saida:
 *   docs/agent-quality-review/batches/batch-NNNN.json
 *
 * CLI:
 *   pnpm tsx scripts/quality-audit/01-dump-turns.ts [--batch-size 40] [--limit-total N] [--sample-strategy stratified|all]
 */

import "dotenv/config";
import { config as loadDotenv } from "dotenv";
import { resolve as resolvePath } from "path";

// Carrega .env.local explicitamente (dotenv/config so carrega .env por padrao).
loadDotenv({ path: resolvePath(process.cwd(), ".env.local"), override: true });

import { prisma } from "@/lib/prisma";
import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";

interface Args {
  batchSize: number;
  limitTotal: number | null;
  sampleStrategy: "stratified" | "all";
}

function parseArgs(argv: string[]): Args {
  const args: Args = { batchSize: 40, limitTotal: null, sampleStrategy: "all" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--batch-size") args.batchSize = parseInt(argv[++i] ?? "40", 10);
    else if (a === "--limit-total") args.limitTotal = parseInt(argv[++i] ?? "0", 10) || null;
    else if (a === "--sample-strategy") args.sampleStrategy = (argv[++i] as Args["sampleStrategy"]) ?? "all";
  }
  return args;
}

interface RawMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  tool_calls: unknown;
  created_at: Date;
}

interface RawUsage {
  conversation_id: string | null;
  model: string;
  tokens_input: number;
  tokens_output: number;
  duration_ms: number | null;
  created_at: Date;
}

interface Turno {
  turnoId: string;
  conversationId: string;
  userMessageId: string;
  userMessage: string;
  toolMessageId: string | null;
  toolCalls: Array<{ id?: string; name: string; arguments: unknown }> | null;
  finalMessageId: string;
  finalMessage: string;
  model: string | null;
  tokensInput: number | null;
  tokensOutput: number | null;
  durationMs: number | null;
  createdAt: string;
  primaryTool: string | null; // pra estratificacao
}

/**
 * Constroi turnos: para cada user message, busca o proximo assistant_final
 * e os assistants intermediarios com tool_calls entre eles.
 */
async function buildTurnos(): Promise<Turno[]> {
  console.log("[dump] carregando mensagens em ordem cronologica por conversa...");

  // Pega tudo de uma vez (banco e dev local; volume aceitavel).
  const messages = await prisma.$queryRaw<RawMessage[]>`
    SELECT id, conversation_id, role, content, tool_calls, created_at
    FROM messages
    ORDER BY conversation_id, created_at ASC
  `;
  console.log(`[dump] ${messages.length} mensagens carregadas.`);

  // Agrupa por conversa.
  const byConv = new Map<string, RawMessage[]>();
  for (const m of messages) {
    const list = byConv.get(m.conversation_id) ?? [];
    list.push(m);
    byConv.set(m.conversation_id, list);
  }

  // Para cada conversa, identifica turnos: user -> (assistant com toolCalls)* -> assistant_final
  const turnos: Turno[] = [];
  for (const [convId, msgs] of byConv) {
    let i = 0;
    while (i < msgs.length) {
      const m = msgs[i];
      if (m.role !== "user") {
        i++;
        continue;
      }

      // Encontra a proxima cadeia de assistants ate um final (sem toolCalls)
      let j = i + 1;
      let toolMessageId: string | null = null;
      let toolCalls: Turno["toolCalls"] = null;
      while (j < msgs.length && msgs[j].role !== "user") {
        const ass = msgs[j];
        if (ass.role === "assistant") {
          const tc = ass.tool_calls;
          if (tc != null && Array.isArray(tc) && tc.length > 0) {
            // Captura o primeiro tool message (na pratica e o unico por turno usual).
            if (toolMessageId == null) {
              toolMessageId = ass.id;
              toolCalls = tc as Turno["toolCalls"];
            }
          } else {
            // Encontrou o final
            turnos.push({
              turnoId: ass.id,
              conversationId: convId,
              userMessageId: m.id,
              userMessage: m.content,
              toolMessageId,
              toolCalls,
              finalMessageId: ass.id,
              finalMessage: ass.content,
              model: null,
              tokensInput: null,
              tokensOutput: null,
              durationMs: null,
              createdAt: ass.created_at.toISOString(),
              primaryTool:
                toolCalls && toolCalls.length > 0 ? (toolCalls[0].name ?? null) : null,
            });
            j++;
            break;
          }
        }
        j++;
      }
      i = j;
    }
  }
  console.log(`[dump] ${turnos.length} turnos completos identificados.`);

  // Enriquece com llm_usage por aproximacao temporal (conversation_id + created_at proximo do finalMessage)
  const usages = await prisma.$queryRaw<RawUsage[]>`
    SELECT conversation_id, model, tokens_input, tokens_output, duration_ms, created_at
    FROM llm_usage
    WHERE conversation_id IS NOT NULL
  `;
  const usagesByConv = new Map<string, RawUsage[]>();
  for (const u of usages) {
    if (!u.conversation_id) continue;
    const list = usagesByConv.get(u.conversation_id) ?? [];
    list.push(u);
    usagesByConv.set(u.conversation_id, list);
  }

  for (const t of turnos) {
    const list = usagesByConv.get(t.conversationId) ?? [];
    // Pega o usage com created_at mais proximo (e <=) ao finalMessage createdAt.
    const tDate = new Date(t.createdAt).getTime();
    let best: RawUsage | null = null;
    let bestDiff = Infinity;
    for (const u of list) {
      const uDate = u.created_at.getTime();
      const diff = Math.abs(tDate - uDate);
      if (diff < bestDiff && diff < 60_000) {
        bestDiff = diff;
        best = u;
      }
    }
    if (best) {
      t.model = best.model;
      t.tokensInput = best.tokens_input;
      t.tokensOutput = best.tokens_output;
      t.durationMs = best.duration_ms;
    }
  }

  return turnos;
}

function stratifyByTool(turnos: Turno[], total: number): Turno[] {
  // Agrupa por tool primaria; sample proporcional.
  const byTool = new Map<string, Turno[]>();
  for (const t of turnos) {
    const key = t.primaryTool ?? "sem_tool";
    const list = byTool.get(key) ?? [];
    list.push(t);
    byTool.set(key, list);
  }

  // Embaralha cada bucket.
  for (const [, list] of byTool) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }

  const sample: Turno[] = [];
  const bucketCount = byTool.size;
  // Distribui total proporcionalmente, com minimo 5 por bucket.
  for (const [, list] of byTool) {
    const proportional = Math.ceil((list.length / turnos.length) * total);
    const take = Math.max(5, Math.min(list.length, proportional));
    sample.push(...list.slice(0, take));
  }

  return sample.slice(0, total);
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(`[dump] batchSize=${args.batchSize} limit=${args.limitTotal ?? "all"} sample=${args.sampleStrategy}`);

  let turnos = await buildTurnos();

  if (args.limitTotal && turnos.length > args.limitTotal) {
    if (args.sampleStrategy === "stratified") {
      turnos = stratifyByTool(turnos, args.limitTotal);
      console.log(`[dump] aplicada amostra estratificada: ${turnos.length}`);
    } else {
      turnos = turnos.slice(0, args.limitTotal);
      console.log(`[dump] truncado para ${turnos.length}`);
    }
  }

  // Embaralha levemente para distribuir tools entre batches sequenciais.
  // (Mantemos seed deterministica simples baseada na ordem do turnoId.)
  turnos.sort((a, b) => a.turnoId.localeCompare(b.turnoId));

  const outDir = resolve(process.cwd(), "docs/agent-quality-review/batches");
  mkdirSync(outDir, { recursive: true });

  let batchIdx = 1;
  for (let i = 0; i < turnos.length; i += args.batchSize) {
    const slice = turnos.slice(i, i + args.batchSize);
    const batchId = batchIdx.toString().padStart(4, "0");
    const out = {
      batchId,
      createdAt: new Date().toISOString(),
      turnos: slice,
    };
    writeFileSync(resolve(outDir, `batch-${batchId}.json`), JSON.stringify(out, null, 2));
    batchIdx++;
  }

  console.log(`[dump] ${batchIdx - 1} batches gravados em ${outDir}`);
  console.log(`[dump] turnos por batch: ${args.batchSize}`);
  console.log(`[dump] total de turnos: ${turnos.length}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("[dump] erro:", err);
    process.exit(1);
  },
);
