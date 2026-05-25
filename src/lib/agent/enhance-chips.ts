/**
 * Two-pass LLM para suggestion chips. Recebe a resposta final do agente
 * (Pass 1, com tools) e devolve cleanMessage (sem bullets-perguntas) +
 * chips ate 7 quando extraidas, ate maxContextual quando geradas pelo
 * contexto.
 *
 * Spec: docs/superpowers/specs/2026-05-25-bubble-v4-spec.md
 *
 * Modulo PURO (sem prisma). Recebe o LLM client ja construido pelo
 * runAgent.
 */

import type { ChatMessage, ProviderClient } from "./llm/types";

export const MAX_EXTRACTED_CHIPS = 7;
export const PASS2_TIMEOUT_MS = 3500;
const MAX_CHIP_LEN = 80;

export interface EnhanceChipsResult {
  cleanMessage: string;
  chips: string[];
  chipsSource: "extracted" | "contextual";
}

export class EnhanceChipsError extends Error {
  constructor(public reason: string) {
    super(`enhance-chips falhou: ${reason}`);
  }
}

/**
 * Constroi o prompt da Pass 2. Recebe a resposta da IA e historico
 * condensado. Espera JSON de volta.
 */
export function buildEnhancePrompt(args: {
  agentResponse: string;
  recentHistoryText: string;
  maxContextual: number;
}): string {
  return `Voce e um analista de UX para chat de IA. Recebe a resposta da IA e o historico recente; devolve JSON.

Sua tarefa: gerar chips de pergunta (botoes clicaveis) para o usuario continuar a conversa.

Regras:

1. Se a resposta tem **uma pergunta de desambiguacao** (ex: "Qual opcao voce quer? - Opcao A - Opcao B") OU lista bullets/enumerada com opcoes para o usuario escolher:
   - chipsSource = "extracted"
   - chips = cada opcao reformulada como pergunta completa (max ${MAX_EXTRACTED_CHIPS} chips)
   - cleanMessage = resposta original COM o trecho da pergunta + bullets REMOVIDO. Mantem o resto do texto intacto.

2. Se a resposta NAO tem pergunta com opcoes (eh uma resposta direta com dados/numeros):
   - chipsSource = "contextual"
   - chips = ate ${args.maxContextual} perguntas que o usuario provavelmente faria a seguir, baseadas no assunto e historico
   - cleanMessage = resposta ORIGINAL sem alteracao

Restricoes:
- Cada chip: <= ${MAX_CHIP_LEN} chars, sem markdown (**, \`, *), pergunta completa e objetiva.
- Chips em portugues brasileiro.
- Nao inclua chips redundantes ou que repetem o que ja esta na resposta.

Output: JSON puro, sem markdown wrapping, sem explicacoes.

Formato:
{"cleanMessage":"...","chips":["pergunta 1","pergunta 2"],"chipsSource":"extracted"}

---

RESPOSTA DA IA:
${args.agentResponse}

---

HISTORICO RECENTE:
${args.recentHistoryText}`;
}

/**
 * Parse seguro da resposta JSON do Pass 2. Sanitiza chips e aplica caps.
 * Lanca EnhanceChipsError em qualquer falha.
 */
export function parseEnhanceResponse(
  raw: string,
  caps: { maxContextual: number },
): EnhanceChipsResult {
  // Tenta extrair JSON mesmo se vier wrapeado em markdown.
  let jsonStr = raw.trim();
  const fenced = jsonStr.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fenced) jsonStr = fenced[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new EnhanceChipsError("json invalido");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new EnhanceChipsError("output nao eh objeto");
  }
  const obj = parsed as Record<string, unknown>;

  const cleanMessage = typeof obj.cleanMessage === "string"
    ? obj.cleanMessage.trim()
    : "";
  if (!cleanMessage) throw new EnhanceChipsError("cleanMessage vazio");

  const chipsRaw = Array.isArray(obj.chips) ? obj.chips : [];
  const chipsSource = obj.chipsSource === "extracted" || obj.chipsSource === "contextual"
    ? obj.chipsSource
    : "contextual";

  const cap = chipsSource === "extracted" ? MAX_EXTRACTED_CHIPS : caps.maxContextual;
  const chips = chipsRaw
    .filter((c): c is string => typeof c === "string")
    .map((c) => c.trim().replace(/\*\*/g, "").replace(/`/g, "").trim())
    .filter((c) => c.length > 0 && c.length <= MAX_CHIP_LEN)
    .slice(0, cap);

  if (chips.length === 0) throw new EnhanceChipsError("chips vazio apos sanitizacao");

  return { cleanMessage, chips, chipsSource };
}

/**
 * Orquestrador. Chama o LLM client com timeout 3.5s. Em qualquer falha
 * lanca EnhanceChipsError; o caller deve cair em fallback.
 */
export async function enhanceWithChips(args: {
  client: ProviderClient;
  agentResponse: string;
  recentHistory: ChatMessage[];
  maxContextual: number;
}): Promise<EnhanceChipsResult> {
  // Condensa as ultimas 3-5 mensagens em texto plain.
  const historyText = args.recentHistory
    .slice(-5)
    .map((m) => `[${m.role}] ${m.content.slice(0, 400)}`)
    .join("\n");

  const prompt = buildEnhancePrompt({
    agentResponse: args.agentResponse,
    recentHistoryText: historyText,
    maxContextual: args.maxContextual,
  });

  const messages: ChatMessage[] = [
    { role: "system", content: "Voce devolve JSON valido. Sem markdown wrapping." },
    { role: "user", content: prompt },
  ];

  const chatPromise = args.client.chat({
    messages,
    tools: undefined,
    stream: false,
    temperature: 0.2,
    maxTokens: 800,
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new EnhanceChipsError("timeout")), PASS2_TIMEOUT_MS);
  });

  const result = await Promise.race([chatPromise, timeoutPromise]);
  if (!result.message) throw new EnhanceChipsError("resposta vazia");

  return parseEnhanceResponse(result.message, { maxContextual: args.maxContextual });
}
