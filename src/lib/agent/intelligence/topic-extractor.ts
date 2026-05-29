/**
 * Extrai topico, dominio e keywords de uma mensagem do usuario.
 *
 * Usado pelo job assincrono `agent-topic-tagging` (Onda 1 Inteligencia) para
 * popular `Conversation.topicTags`. Sempre fora do caminho critico do chat.
 *
 * Modelo: respeitando o padrao do projeto, reutiliza a credencial LLM ativa
 * (`getActiveLlmConfig`). Em ambiente onde so ha OpenAI/OpenRouter cadastradas,
 * o modelo barato vem do mesmo provider. Reasoning OFF (Haiku/Flash nao
 * suportam; tarefa simples).
 *
 * Spec: docs/superpowers/specs/2026-05-25-agente-nex-inteligencia-design.md §4.3
 */

// Nao importar "server-only" , este modulo precisa rodar no worker tsx
// (lesson 2026-05-25 15:45 sobre exchange-rate.ts).

import { getActiveLlmConfig } from "@/lib/agent/llm/get-active-config";
import { buildLlmClient } from "@/lib/agent/llm/get-client";
import { getReasoningEffortForCaller } from "./reasoning-effort-policy";

export interface TopicExtractionResult {
  /** Topico principal da mensagem (ex.: "estoque", "faturamento", "produto", "outros"). */
  topic: string;
  /** Dominio de negocio (ex.: "comercial", "fiscal", "estoque", "cadastros"). */
  domain: string;
  /** Lista de palavras-chave relevantes; cap 4 keywords. */
  keywords: string[];
}

const FALLBACK: TopicExtractionResult = {
  topic: "outros",
  domain: "outros",
  keywords: [],
};

const SYSTEM_PROMPT = `Voce e um classificador de mensagens de usuarios de um sistema de gestao ERP.
A empresa atua em estoque, fiscal, comercial, financeiro, cadastros, contabil, crm.

Sua tarefa: dado uma ou mais mensagens do usuario, retornar JSON com:
- topic: 1-3 palavras lowercase descrevendo o assunto principal
  (ex.: "saldo de produto", "faturamento mensal", "contas a receber").
- domain: dominio de negocio. Valores aceitos:
  cadastros | comercial | contabil | crm | estoque | financeiro | fiscal | outros.
- keywords: ate 4 palavras-chave (substantivos lowercase, sem pontuacao).

Responda APENAS o JSON, sem texto adicional. Exemplo:
{"topic":"saldo de produto","domain":"estoque","keywords":["saldo","produto","mola","estoque"]}`;

/**
 * Classifica uma ou mais mensagens em (topic, domain, keywords).
 *
 * @param userMessages  Lista de mensagens do usuario (concatenadas para contexto).
 * @returns  Resultado normalizado. Em falha (LLM erro, JSON invalido, etc),
 *           retorna FALLBACK com topic="outros".
 */
export async function extractTopics(
  userMessages: string[],
): Promise<TopicExtractionResult> {
  if (userMessages.length === 0) return FALLBACK;

  const llm = await getActiveLlmConfig();
  if (!llm) return FALLBACK;

  try {
    const client = buildLlmClient(llm.provider, llm.apiKey, llm.model);
    const result = await client.chat({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            "Mensagens do usuario (concatenadas para extracao):\n\n" +
            userMessages.slice(0, 5).map((m) => "- " + m).join("\n"),
        },
      ],
      temperature: 0.1,
      maxTokens: 200,
      reasoningEffort: getReasoningEffortForCaller("topic-extractor"),
    });

    const parsed = parseJsonResponse(result.message);
    return parsed ?? FALLBACK;
  } catch (err) {
    console.warn("[topic-extractor] LLM call falhou:", err);
    return FALLBACK;
  }
}

function parseJsonResponse(raw: string): TopicExtractionResult | null {
  // O modelo pode envelopar com markdown code fence ou prefixo. Extrai o
  // primeiro objeto JSON valido.
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const p = parsed as Record<string, unknown>;

    const topic = typeof p.topic === "string" && p.topic.trim().length > 0
      ? p.topic.trim().toLowerCase()
      : "outros";

    const domain = typeof p.domain === "string" && isKnownDomain(p.domain.trim().toLowerCase())
      ? p.domain.trim().toLowerCase()
      : "outros";

    const keywords = Array.isArray(p.keywords)
      ? p.keywords
          .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
          .map((k) => k.trim().toLowerCase())
          .slice(0, 4)
      : [];

    return { topic, domain, keywords };
  } catch {
    return null;
  }
}

// Alinhado com REPORT_DOMAINS (RBAC v2): 7 domínios reais + "outros" como fallback.
// Mantido em sincronia com src/lib/reports/domains.ts via teste de coerência.
const KNOWN_DOMAINS = new Set([
  "cadastros",
  "comercial",
  "contabil",
  "crm",
  "estoque",
  "financeiro",
  "fiscal",
  "outros",
]);

function isKnownDomain(value: string): boolean {
  return KNOWN_DOMAINS.has(value);
}
