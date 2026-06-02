#!/usr/bin/env tsx
/**
 * Avalia (julga) as avaliacoes em status PENDENTE do Backtest via LLM-judge,
 * usando o MESMO modelo configurado (ex.: gpt-5.4-mini). Substitui o julgamento
 * manual: para cada turno pendente, monta a pergunta + resposta + contexto curto
 * da conversa e pede ao modelo um veredito estruturado, gravando status/razoes.
 *
 * Disparado pelo botao localhost-only do Backtest (server action) ou via CLI:
 *   tsx scripts/quality-audit/evaluate-pendentes.ts [--limit N]
 *
 * NAO e' heuristico de regex (que ja provou ruim). E' LLM-as-judge com rubric.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { getActiveLlmConfig } from "@/lib/agent/llm/get-active-config";
import { buildLlmClient } from "@/lib/agent/llm/get-client";

const STATUSES = [
  "CORRETO",
  "PARCIAL",
  "ERRADO",
  "FORA_DO_ESCOPO",
  "FALHA_TECNICA",
] as const;
type Status = (typeof STATUSES)[number];

const CONCURRENCY = 5;
const JUDGE_VERSION = "llm-judge-v1";

function parseLimit(): number | null {
  const i = process.argv.indexOf("--limit");
  if (i >= 0) return parseInt(process.argv[i + 1] ?? "0", 10) || null;
  return null;
}

const RUBRIC = `Voce e um avaliador rigoroso de respostas de um agente de IA (Nex) que
responde perguntas sobre a operacao de uma empresa (estoque, financeiro, fiscal,
comercial, cadastros, contabil, CRM) lendo de um cache do ERP Odoo.

Classifique a ULTIMA resposta do assistente em UM destes status:
- CORRETO: responde a pergunta de forma util e coerente com os dados/tools; ou,
  quando nao havia dado, diz honestamente "nao ha X no periodo" (vazio != erro).
- PARCIAL: responde em parte, mas falta algo pedido, ou mistura certo e impreciso,
  ou devolve dado cru/sem formatar quando deveria resumir.
- ERRADO: contradiz os dados, inventa numero/nome, ou erra a interpretacao.
- FORA_DO_ESCOPO: pergunta fora do dominio de negocio do agente.
- FALHA_TECNICA: a resposta e' uma mensagem de erro/indisponibilidade ("nao
  consegui obter", "erro ao", "tente novamente", "indisponivel"), JSON cru nao
  formatado, ou placeholder tipo "Xs atras" , indica falha de tool/rota, nao
  resposta de negocio.

Considere o CONTEXTO da conversa (perguntas anteriores) para follow-ups curtos.
Responda SOMENTE com JSON valido, sem markdown:
{"status":"CORRETO|PARCIAL|ERRADO|FORA_DO_ESCOPO|FALHA_TECNICA","razoes":"1-2 frases objetivas","patterns":["curto","opcional"]}`;

interface Pendente {
  id: string;
  conversationId: string | null;
  question: string;
  answer: string;
}

async function loadTranscript(convId: string | null): Promise<string> {
  if (!convId) return "";
  const msgs = await prisma.$queryRaw<Array<{ role: string; content: string }>>`
    SELECT role, content FROM messages
    WHERE conversation_id = ${convId}::uuid AND role IN ('user','assistant')
    ORDER BY created_at ASC
    LIMIT 8
  `;
  return msgs
    .map((m) => `${m.role === "user" ? "Usuario" : "Nex"}: ${m.content.slice(0, 600)}`)
    .join("\n");
}

function parseVerdict(text: string): {
  status: Status;
  razoes: string;
  patterns: string[];
} | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]) as {
      status?: string;
      razoes?: string;
      patterns?: unknown;
    };
    if (!o.status || !STATUSES.includes(o.status as Status)) return null;
    return {
      status: o.status as Status,
      razoes: (o.razoes ?? "").toString().slice(0, 600),
      patterns: Array.isArray(o.patterns)
        ? o.patterns.map((p) => String(p)).slice(0, 5)
        : [],
    };
  } catch {
    return null;
  }
}

async function main() {
  const limit = parseLimit();
  const cfg = await getActiveLlmConfig();
  if (!cfg) throw new Error("Nenhuma credencial LLM ativa configurada.");
  const client = buildLlmClient(cfg.provider, cfg.apiKey, cfg.model);
  console.log(`[judge] modelo=${cfg.model} provider=${cfg.provider}`);

  const rows = await prisma.conversationQualityEvaluation.findMany({
    where: { status: "PENDENTE" },
    select: {
      id: true,
      conversationId: true,
      questionSnapshot: true,
      answerSnapshot: true,
    },
    orderBy: { createdAt: "asc" },
    ...(limit ? { take: limit } : {}),
  });
  const pendentes: Pendente[] = rows.map((r) => ({
    id: r.id,
    conversationId: r.conversationId,
    question: r.questionSnapshot ?? "",
    answer: r.answerSnapshot ?? "",
  }));
  console.log(`[judge] ${pendentes.length} pendentes para avaliar`);
  if (pendentes.length === 0) {
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  let ok = 0;
  let fail = 0;
  const counts: Record<string, number> = {};

  async function judgeOne(p: Pendente): Promise<void> {
    try {
      const transcript = await loadTranscript(p.conversationId);
      const userContent =
        `Pergunta: ${p.question}\n\n` +
        (transcript ? `Contexto da conversa:\n${transcript}\n\n` : "") +
        `Resposta do Nex a avaliar:\n${p.answer}`;
      const res = await client.chat({
        messages: [
          { role: "system", content: RUBRIC },
          { role: "user", content: userContent },
        ],
        temperature: 0,
        maxTokens: 400,
      });
      const verdict = parseVerdict(res.message ?? "");
      if (!verdict) {
        fail++;
        return;
      }
      await prisma.conversationQualityEvaluation.update({
        where: { id: p.id },
        data: {
          status: verdict.status,
          razoes: verdict.razoes,
          patterns: verdict.patterns,
          judgeModel: cfg!.model,
          judgeVersion: JUDGE_VERSION,
          model: cfg!.model,
        },
      });
      ok++;
      counts[verdict.status] = (counts[verdict.status] ?? 0) + 1;
    } catch (e) {
      fail++;
      if (fail <= 3) console.warn(`[judge] erro em ${p.id}:`, (e as Error).message.slice(0, 120));
    } finally {
      done++;
      if (done % 20 === 0) console.log(`[judge] ${done}/${pendentes.length}`);
    }
  }

  // Pool de concorrencia.
  let idx = 0;
  async function worker() {
    while (idx < pendentes.length) {
      const my = idx++;
      await judgeOne(pendentes[my]);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log(`[judge] concluido: ok=${ok} fail=${fail}`);
  console.log(`[judge] distribuicao:`, counts);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("[judge] ERRO:", e);
  process.exit(1);
});
