/**
 * Juiz de qualidade de respostas do Agente Nex (Frente A — analise retrospectiva).
 *
 * Modelo default: `google/gemini-2.5-pro-thinking` (via OpenRouter; nas
 * credenciais do projeto so ha OpenAI + OpenRouter). Configuravel via
 * `AgentSettings.qualityJudgeModel`.
 *
 * Rubrica 4 dimensoes (1-5, ou null quando dimensao nao aplicavel):
 *  - aderencia: a resposta atende o que foi perguntado?
 *  - correcaoFactual: a resposta e coerente com o resultado ORIGINAL da tool?
 *    (null quando original_result_missing)
 *  - escolhaDeTools: tool certa? quantidade adequada?
 *  - clareza: resposta clara e bem estruturada?
 *
 * Sempre tenta extrair recomendacao_prompt — texto livre sugerindo mudanca
 * pontual no prompt-mestre.
 *
 * Spec: docs/superpowers/specs/2026-05-25-agente-nex-inteligencia-design.md §3.4
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { buildLlmClient } from "@/lib/agent/llm/get-client";
import type { LlmProvider } from "@/lib/agent/llm/types";
import type { ReplayItem } from "./tool-replayer";
import { getReasoningEffortForCaller } from "./reasoning-effort-policy";

export interface JudgeInput {
  userMessage: string;
  assistantMessage: string;
  replay: ReplayItem[];
  originalResultMissing: boolean;
}

export interface JudgeOutput {
  aderencia: number | null;
  correcaoFactual: number | null;
  escolhaDeTools: number | null;
  clareza: number | null;
  razoes: string;
  recomendacaoPrompt: string | null;
  judgeModel: string;
  judgeVersion: string;
  flags: string[];
}

export const JUDGE_VERSION = "v1-2026-05";

const DEFAULT_JUDGE_MODEL = "google/gemini-2.5-pro-thinking";
const FALLBACK_JUDGE_MODEL = "anthropic/claude-opus-4-7";

const RUBRICA = `Voce e um auditor independente de respostas de um agente de IA conversacional
que responde perguntas sobre dados operacionais de uma empresa (estoque,
faturamento, contas a receber, produtos, vendas, etc).

Avalie a resposta do agente em 4 dimensoes, cada uma de 1 a 5
(1 = ruim, 5 = excelente). Quando a dimensao NAO se aplica, retorne null.

Dimensoes:
- aderencia: a resposta atende exatamente o que foi perguntado, sem desvio?
- correcaoFactual: a resposta e coerente com o resultado ORIGINAL das tools
  invocadas? Compare APENAS com o resultado original (campo "originalResult"),
  NAO com a re-execucao de hoje. Se "originalResultMissing"=true, retorne null
  e ignore esta dimensao.
- escolhaDeTools: a IA escolheu a tool certa? Usou tools demais/de menos?
- clareza: a resposta e clara, bem estruturada, sem jargao desnecessario?

Alem disso, sugira (campo "recomendacaoPrompt") UMA mudanca pontual no
prompt-mestre do agente que melhoraria respostas similares no futuro. Se
nada material, retorne null.

Responda APENAS JSON, sem texto extra. Formato:
{"aderencia":N,"correcaoFactual":N,"escolhaDeTools":N,"clareza":N,
 "razoes":"texto curto explicando","recomendacaoPrompt":"texto ou null"}`;

export async function judgeAnswer(input: JudgeInput): Promise<JudgeOutput> {
  const flags: string[] = [];

  // Resolve modelo configurado.
  const settings = await prisma.agentSettings.findUnique({
    where: { id: "global" },
    select: { qualityJudgeModel: true },
  });
  const modelId = settings?.qualityJudgeModel ?? DEFAULT_JUDGE_MODEL;

  const llm = await resolveJudgeLlm(modelId);
  if (!llm) {
    flags.push("judge_unavailable");
    return emptyJudgeOutput(modelId, flags);
  }

  try {
    const client = buildLlmClient(llm.provider, llm.apiKey, llm.model);
    const result = await client.chat({
      messages: [
        { role: "system", content: RUBRICA },
        {
          role: "user",
          content: buildJudgePrompt(input),
        },
      ],
      temperature: 0,
      maxTokens: 800,
      reasoningEffort: getReasoningEffortForCaller("quality-judge"),
    });

    const parsed = parseJudgeJson(result.message);
    if (!parsed) {
      flags.push("judge_parse_failed");
      return emptyJudgeOutput(llm.model, flags, result.message);
    }

    // Quando faltou original e o juiz pontuou correcaoFactual, anula com flag.
    if (input.originalResultMissing && parsed.correcaoFactual != null) {
      flags.push("correcao_overruled_missing_original");
      parsed.correcaoFactual = null;
    }
    if (input.originalResultMissing) flags.push("original_result_missing");
    if (input.replay.some((r) => r.flags.includes("tool_diverged"))) {
      flags.push("tool_diverged");
    }

    return {
      ...parsed,
      judgeModel: llm.model,
      judgeVersion: JUDGE_VERSION,
      flags,
    };
  } catch (err) {
    console.warn("[quality-judge] LLM call falhou:", err);
    flags.push("judge_threw");
    return emptyJudgeOutput(modelId, flags);
  }
}

function buildJudgePrompt(input: JudgeInput): string {
  const replayBlocks = input.replay
    .slice(0, 10)
    .map((r) => {
      return [
        `Tool: ${r.name}`,
        `Args originais: ${JSON.stringify(r.originalArgs).slice(0, 500)}`,
        `Resultado original: ${(r.originalResult ?? "(ausente)").slice(0, 800)}`,
        r.newResult
          ? `Resultado atual (re-executado, apenas informativo): ${r.newResult.slice(0, 400)}`
          : "Re-execucao: indisponivel.",
        r.flags.length > 0 ? `Flags: ${r.flags.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n---\n\n");

  return [
    `Pergunta do usuario:\n${input.userMessage.slice(0, 2000)}`,
    `\nResposta do agente:\n${input.assistantMessage.slice(0, 3000)}`,
    `\noriginalResultMissing: ${input.originalResultMissing}`,
    replayBlocks ? `\nTool calls do turno:\n\n${replayBlocks}` : "\nTool calls: nenhuma.",
  ].join("\n");
}

function parseJudgeJson(raw: string): JudgeOutput | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const o = JSON.parse(match[0]) as Record<string, unknown>;
    return {
      aderencia: clampScore(o.aderencia),
      correcaoFactual: clampScore(o.correcaoFactual),
      escolhaDeTools: clampScore(o.escolhaDeTools),
      clareza: clampScore(o.clareza),
      razoes: typeof o.razoes === "string" ? o.razoes : "",
      recomendacaoPrompt:
        typeof o.recomendacaoPrompt === "string" && o.recomendacaoPrompt.trim().length > 0
          ? o.recomendacaoPrompt.trim()
          : null,
      judgeModel: "",
      judgeVersion: "",
      flags: [],
    };
  } catch {
    return null;
  }
}

function clampScore(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (v < 1) return 1;
  if (v > 5) return 5;
  return Math.round(v);
}

function emptyJudgeOutput(model: string, flags: string[], razoes?: string): JudgeOutput {
  return {
    aderencia: null,
    correcaoFactual: null,
    escolhaDeTools: null,
    clareza: null,
    razoes: razoes ?? "",
    recomendacaoPrompt: null,
    judgeModel: model,
    judgeVersion: JUDGE_VERSION,
    flags,
  };
}

/**
 * Resolve credencial para o modelo do juiz. Formato `provider/model` aceito.
 * Default Gemini 2.5 Pro thinking via OpenRouter; fallback Opus via OpenRouter
 * se Gemini indisponivel no catalogo configurado.
 */
async function resolveJudgeLlm(
  modelId: string,
): Promise<{ provider: LlmProvider; model: string; apiKey: string } | null> {
  const candidates = [modelId, DEFAULT_JUDGE_MODEL, FALLBACK_JUDGE_MODEL];

  for (const candidate of candidates) {
    const { provider, model } = splitProviderModel(candidate);
    if (!provider) continue;

    // Procura credencial ativa daquele provider. Para "openrouter/..." e mesma
    // credencial servir varios modelos.
    const cred = await prisma.llmCredential.findFirst({
      where: { provider, revokedAt: null } as { provider: string; revokedAt: null },
      orderBy: { updatedAt: "desc" },
    });

    if (cred?.encryptedApiKey) {
      try {
        return {
          provider: provider as LlmProvider,
          model,
          apiKey: decrypt(cred.encryptedApiKey),
        };
      } catch {
        continue;
      }
    }
  }

  return null;
}

function splitProviderModel(modelId: string): { provider: string | null; model: string } {
  const idx = modelId.indexOf("/");
  if (idx < 0) {
    // Sem prefixo provider — assume openrouter por compatibilidade.
    return { provider: "openrouter", model: modelId };
  }
  // OpenRouter usa formato "vendor/model" como o proprio model. Ex.:
  // "google/gemini-2.5-pro-thinking" → provider=openrouter, model intacto.
  const head = modelId.slice(0, idx);
  // Heuristica: se head e um provider conhecido, usa direto; senao mantem
  // openrouter (que ja aceita "vendor/model" como model).
  const KNOWN: Record<string, boolean> = {
    openai: true,
    anthropic: true,
    gemini: true,
    openrouter: true,
  };
  if (KNOWN[head]) {
    return { provider: head, model: modelId.slice(idx + 1) };
  }
  return { provider: "openrouter", model: modelId };
}
