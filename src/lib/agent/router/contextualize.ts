/**
 * R2-ctx: Camada 2 do router contextual , reformulação da pergunta.
 *
 * Quando o embedding da pergunta crua (Camada 1) cai em fallback, esta função
 * usa uma LLM barata para reescrever a pergunta atual numa versão
 * autossuficiente, com base nos últimos N pares (user -> resposta final). O
 * caller (run-agent) re-embedda a versão reformulada (Camada 3).
 *
 * Espelha o padrão de `intelligence/contextual-suggester.ts` (monta pares,
 * chama LLM com timeout, fallback seguro). A chamada de chat é registrada em
 * LlmUsage com origem "router_reformulacao" (telemetria, fire-and-forget).
 *
 * Spec: docs/superpowers/specs/2026-05-29-roteamento-contextual-e-janela-de-contexto-design.md §4.
 */

import "server-only";

import { getLastNPairs } from "@/lib/agent/conversation";
import { buildLlmClient } from "@/lib/agent/llm/get-client";
import { logUsage } from "@/lib/agent/llm/usage-logger";
import type { LlmProvider } from "@/lib/agent/llm/types";
import type { FocoAtual } from "@/lib/agent/memoria/foco-atual";
import {
  resolverAnaforaDeterministica,
  type EntidadeRecente,
} from "./anafora-heuristica";

const TIMEOUT_MS = 2500;

const SYSTEM_PROMPT = `Voce reescreve a ultima pergunta de um usuario para uma versao AUTOSSUFICIENTE,
usando o historico da conversa para resolver referencias (ex.: "e do mes passado?",
"e esse produto?", "valeu, e a semana?").

Regras:
- Devolva APENAS a pergunta reformulada, em UMA linha, sem aspas, sem markdown, sem explicacao.
- Seja curto e direto; nao invente dados que nao estao no historico.
- Se a pergunta ja e autossuficiente, devolva-a praticamente como esta.
- Mantenha o idioma do usuario (portugues).`;

export interface ReformulateInput {
  conversationId: string | null;
  currentQuestion: string;
  nPairs: number;
  llm: { provider: string; apiKey: string; model: string };
  /** Credencial usada (para atribuir o consumo no painel). */
  credentialId?: string | null;
  userId?: string;
  isPlayground?: boolean;
  /** T4.3: working memory da conversa para a heurística de anáfora. */
  focoAtual?: FocoAtual | null;
  /** T4.3: entidades recentes (ConversationEntity, recência por turno). */
  entidadesRecentes?: EntidadeRecente[];
}

export interface ReformulateResult {
  /** Pergunta reformulada (1 linha) ou null se não rodou / falhou. */
  reformulated: string | null;
  /** true quando a LLM rodou e produziu uma pergunta. */
  used: boolean;
}

export async function reformulateQuestion(
  input: ReformulateInput,
): Promise<ReformulateResult> {
  if (!input.conversationId) return { reformulated: null, used: false };

  // T4.3: heurística determinística primeiro (zero LLM). "ambigua" NÃO cai no
  // CQR: fica sem reformular e a regra 12b do prompt clarifica com o usuário.
  const heur = resolverAnaforaDeterministica(
    input.currentQuestion,
    input.focoAtual ?? null,
    input.entidadesRecentes ?? [],
  );
  if (heur.status === "resolvida") {
    return { reformulated: heur.reformulada, used: true };
  }
  if (heur.status === "ambigua") return { reformulated: null, used: false };

  const pairs = await getLastNPairs(input.conversationId, input.nPairs);
  if (pairs.length === 0) return { reformulated: null, used: false };

  // Ordem cronológica asc para o LLM (getLastNPairs retorna desc).
  const historico = pairs
    .slice()
    .reverse()
    .map(
      (p, i) =>
        `# Par ${i + 1}\nUsuario: ${p.user.content.slice(0, 400)}\nAgente: ${p.assistant.content.slice(0, 600)}`,
    )
    .join("\n\n");

  try {
    const client = buildLlmClient(
      input.llm.provider as LlmProvider,
      input.llm.apiKey,
      input.llm.model,
    );
    const chatPromise = client.chat({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Historico (mais antigo primeiro):\n\n${historico}\n\nPergunta atual do usuario:\n${input.currentQuestion}\n\nReescreva a pergunta atual de forma autossuficiente.`,
        },
      ],
      temperature: 0,
      maxTokens: 120,
    });
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), TIMEOUT_MS),
    );

    const result = await Promise.race([chatPromise, timeoutPromise]);
    if (result === null) return { reformulated: null, used: false };

    // Telemetria: a chamada de reformulação vira uma linha de consumo
    // (origem router_reformulacao). Fire-and-forget, não bloqueia o turno.
    void logUsage({
      provider: input.llm.provider,
      model: input.llm.model,
      tokensInput: result.usage.tokensInput,
      tokensOutput: result.usage.tokensOutput,
      conversationId: input.conversationId ?? undefined,
      userId: input.userId,
      isPlayground: input.isPlayground,
      origin: "router_reformulacao",
      credentialId: input.credentialId ?? undefined,
      requestKind: "texto",
    });

    const firstLine =
      (result.message ?? "")
        .split("\n")
        .map((s) => s.trim())
        .find((s) => s.length > 0) ?? "";
    const cleaned = firstLine
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/[*_`|]/g, "")
      .trim();
    if (!cleaned) return { reformulated: null, used: false };
    return { reformulated: cleaned, used: true };
  } catch (err) {
    console.warn("[router:contextualize] erro:", err);
    return { reformulated: null, used: false };
  }
}
