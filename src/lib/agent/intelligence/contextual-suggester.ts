/**
 * Gera sugestoes de continuidade contextuais (Frente C).
 *
 * Recebe os ultimos N pares user->finalAssistant e devolve ate `N` chips que:
 *  - fazem sentido como proximo passo na linha de raciocinio
 *  - nao repetem caminhos ja trilhados (dedup simples por overlap textual)
 *  - sugerem aprofundamento, comparacao, agregacao ou pivo
 *
 * Modelo: chama a camada LLM ativa do projeto via `buildLlmClient`. Em ambiente
 * onde so ha OpenAI/OpenRouter cadastradas, ambos servem. Sem reasoning
 * (Haiku/Flash nao suportam; tarefa rapida).
 *
 * Timeout default 2.5s; em timeout/erro retorna fallback vazio para o caller
 * cair em `extractSuggestions` legado.
 *
 * Spec: docs/superpowers/specs/2026-05-25-agente-nex-inteligencia-design.md §5
 */

import "server-only";

import { getActiveLlmConfig } from "@/lib/agent/llm/get-active-config";
import { buildLlmClient } from "@/lib/agent/llm/get-client";
import { getLastNPairs } from "@/lib/agent/conversation";
import { getReasoningEffortForCaller } from "./reasoning-effort-policy";

const TIMEOUT_MS = 2500;
const DEFAULT_N_PAIRS = 5;
const MAX_OUTPUT_CHIPS = 7;
const MIN_CHIP_LEN = 8;
const MAX_CHIP_LEN = 80;

const SYSTEM_PROMPT = `Voce gera sugestoes de continuidade para uma conversa entre um usuario e um
agente de IA que responde sobre dados operacionais (estoque, faturamento,
contas a receber, produtos, vendas).

Sua tarefa: dado o historico dos ultimos pares (pergunta -> resposta final),
gere ate 3 sugestoes de proximas perguntas que:
- Sigam a linha de raciocinio do usuario (aprofundamento, comparacao,
  agregacao, pivo natural).
- NAO repitam o que o usuario ja perguntou ou o que a resposta ja entregou.
- Sejam perguntas COMPLETAS e OBJETIVAS, que o agente consiga responder
  direto sem nova clarificacao.
- Tenham parametros explicitos (periodo, escopo) quando relevante.

Cada sugestao: 8 a 80 caracteres, sem markdown, sem aspas, sem barras "|".

Responda APENAS uma JSON array de strings. Exemplo:
["Como esta o faturamento de maio?","Quais produtos mais venderam em maio?","Liste as 10 maiores contas a receber"]`;

export interface SuggestContinuationInput {
  conversationId: string;
  maxChips?: number;
}

export interface SuggestContinuationResult {
  chips: string[];
  /** Origem: ok | timeout | error | empty_context. */
  source: "ok" | "timeout" | "error" | "empty_context";
}

export async function suggestContinuation(
  input: SuggestContinuationInput,
): Promise<SuggestContinuationResult> {
  const max = clamp(input.maxChips ?? 3, 1, MAX_OUTPUT_CHIPS);

  const pairs = await getLastNPairs(input.conversationId, DEFAULT_N_PAIRS);
  if (pairs.length === 0) {
    return { chips: [], source: "empty_context" };
  }

  const llm = await getActiveLlmConfig();
  if (!llm) {
    return { chips: [], source: "error" };
  }

  // Constroi contexto do prompt.
  const historico = pairs
    .reverse() // ordem cronologica asc para o LLM
    .map((p, i) => {
      return `# Par ${i + 1}\nUsuario: ${p.user.content.slice(0, 400)}\nAgente: ${p.assistant.content.slice(0, 600)}`;
    })
    .join("\n\n");

  try {
    const client = buildLlmClient(llm.provider, llm.apiKey, llm.model);
    const promise = client.chat({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Historico:\n\n${historico}\n\nGere ate ${max} sugestoes.` },
      ],
      temperature: 0.4,
      maxTokens: 300,
      reasoningEffort: getReasoningEffortForCaller("contextual-suggester"),
    });

    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), TIMEOUT_MS),
    );

    const result = await Promise.race([promise, timeoutPromise]);
    if (result === null) {
      return { chips: [], source: "timeout" };
    }

    const chips = parseJsonArray((result as { message: string }).message)
      .map(sanitizeChip)
      .filter((c) => c.length >= MIN_CHIP_LEN && c.length <= MAX_CHIP_LEN)
      .slice(0, max);

    const deduped = dedupAgainstHistory(
      chips,
      pairs.flatMap((p) => [p.user.content, p.assistant.content]),
    ).slice(0, max);

    return { chips: deduped, source: "ok" };
  } catch (err) {
    console.warn("[contextual-suggester] erro:", err);
    return { chips: [], source: "error" };
  }
}

function parseJsonArray(raw: string): string[] {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter((s): s is string => typeof s === "string");
  } catch {
    return [];
  }
}

function sanitizeChip(s: string): string {
  return s
    .replace(/[`*_]/g, "")
    .replace(/\|/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Dedup simples por overlap de tokens com historico recente. Threshold:
 * >= 70% de overlap dos tokens da chip com qualquer item do historico.
 */
function dedupAgainstHistory(chips: string[], historyItems: string[]): string[] {
  const historyTokenSets = historyItems.map((h) => tokenize(h));
  const out: string[] = [];
  const seenInOutput = new Set<string>();

  for (const chip of chips) {
    const chipTokens = tokenize(chip);
    if (chipTokens.size === 0) continue;

    // dedup contra chips ja aceitas
    const chipKey = chip.toLowerCase();
    if (seenInOutput.has(chipKey)) continue;

    // dedup semantica leve contra historia
    let repeats = false;
    for (const hist of historyTokenSets) {
      const overlap = countOverlap(chipTokens, hist) / chipTokens.size;
      if (overlap >= 0.7) {
        repeats = true;
        break;
      }
    }
    if (!repeats) {
      out.push(chip);
      seenInOutput.add(chipKey);
    }
  }
  return out;
}

function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase().match(/[a-z0-9çãáéíóúâêôà]{3,}/g) ?? [],
  );
}

function countOverlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
