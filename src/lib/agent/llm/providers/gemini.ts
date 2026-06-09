/**
 * Adapter HTTP para a API do Google Gemini.
 *
 * Portado de nexus-insights/src/lib/llm/providers/gemini.ts.
 * role "tool" → functionResponse; role "assistant" → role "model".
 */

import { calculateCost, effortToBudget, reasoningCapsOf } from "../catalog";
import type {
  ChatMessage,
  ChatRequest,
  ChatResult,
  ProviderClient,
  ReasoningContext,
  ReasoningEffort,
  ToolCall,
  ToolDefinition,
} from "../types";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_TIMEOUT_MS = 120_000; // 2 min (era 90s), consistente com os demais providers.

function mapEffortToLevel(effort: ReasoningEffort): "minimal" | "low" | "medium" | "high" {
  if (effort === "auto") return "high";
  return effort;
}

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: object };
  functionResponse?: { name: string; response: object };
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[]; role?: string };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

export function isMockKey(apiKey: string): boolean {
  return !apiKey || apiKey.trim() === "" || apiKey.startsWith("MOCK");
}

interface GeminiContentParam {
  role: "user" | "model";
  parts: GeminiPart[];
}

function mapMessages(messages: ChatMessage[]): {
  systemInstruction?: { parts: GeminiPart[] };
  contents: GeminiContentParam[];
} {
  const systemTexts: string[] = [];
  const contents: GeminiContentParam[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      systemTexts.push(m.content);
      continue;
    }
    if (m.role === "tool") {
      // Gemini: tool result → functionResponse dentro de role=user
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: m.toolName ?? m.toolCallId ?? "tool",
              response: { result: m.content },
            },
          },
        ],
      });
      continue;
    }
    if (m.role === "assistant") {
      // assistant → "model"
      const parts: GeminiPart[] = [];
      if (m.content) parts.push({ text: m.content });
      if (m.toolCalls) {
        for (const tc of m.toolCalls) {
          parts.push({ functionCall: { name: tc.name, args: tc.arguments } });
        }
      }
      contents.push({ role: "model", parts });
      continue;
    }
    contents.push({ role: "user", parts: [{ text: m.content }] });
  }

  const systemInstruction =
    systemTexts.length > 0
      ? { parts: [{ text: systemTexts.join("\n\n") }] }
      : undefined;

  return { systemInstruction, contents };
}

function mapTools(tools?: ToolDefinition[]): unknown[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ];
}

export class GeminiClient implements ProviderClient {
  readonly provider = "gemini" as const;

  constructor(
    private readonly apiKey: string,
    public readonly model: string,
  ) {}

  async chat(request: ChatRequest): Promise<ChatResult> {
    if (isMockKey(this.apiKey)) {
      const tokensInput = 100;
      const tokensOutput = 50;
      const { costUsd } = calculateCost(this.model, tokensInput, tokensOutput);
      return {
        message:
          "[MOCK Gemini] Resposta simulada , configure a API key para respostas reais.",
        usage: { tokensInput, tokensOutput, costUsd: costUsd ?? 0 },
      };
    }

    const cap = reasoningCapsOf(this.model);
    const { systemInstruction, contents } = mapMessages(request.messages);

    // Onda 5: multi-turn injetando parts inteiras do reasoningHistory (Gemini-only).
    const contentsWithHistory = injectGeminiHistory(contents, request.reasoningHistory);

    const body: Record<string, unknown> = { contents: contentsWithHistory };
    if (systemInstruction) body.systemInstruction = systemInstruction;
    const tools = mapTools(request.tools);
    if (tools) body.tools = tools;

    const generationConfig: Record<string, unknown> = {};
    if (typeof request.temperature === "number") {
      generationConfig.temperature = request.temperature;
    }
    if (typeof request.maxTokens === "number") {
      generationConfig.maxOutputTokens = request.maxTokens;
    }

    // Onda 5: thinkingConfig por modelo via REASONING_CAPS.
    const wantsThinking =
      request.reasoningEffort && cap && cap.enabled && cap.supportsWithTools;
    if (wantsThinking) {
      const thinkingConfig: Record<string, unknown> = { includeThoughts: false };
      if (cap!.adaptiveMode) {
        thinkingConfig.thinkingBudget = -1;
      } else if (cap!.geminiShape === "level") {
        thinkingConfig.thinkingLevel = mapEffortToLevel(request.reasoningEffort!);
      } else if (cap!.geminiShape === "budget") {
        const budget = request.reasoningMaxTokens
          ?? effortToBudget(this.model, request.reasoningEffort!);
        if (typeof budget === "number") {
          thinkingConfig.thinkingBudget = budget;
        }
      }
      generationConfig.thinkingConfig = thinkingConfig;
    }

    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig;
    }

    const url = `${GEMINI_BASE_URL}/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const timeoutMs = cap?.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new Error(`Gemini timeout apos ${timeoutMs}ms`);
      }
      throw err;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Gemini ${res.status}: ${text || res.statusText}`);
    }

    const data = (await res.json()) as GeminiResponse & {
      usageMetadata?: { thoughtsTokenCount?: number };
    };
    const candidate = data.candidates?.[0];
    let messageText = "";
    const toolCalls: ToolCall[] = [];
    // Onda 5: salvar TODAS as parts da resposta (com thoughtSignature) para o
    // proximo turno. Multi-turn Gemini com function calling exige reenvio
    // exato das parts do turno anterior (incluindo signatures).
    const responseParts = candidate?.content?.parts ?? [];

    for (const part of responseParts) {
      if (part.text) messageText += part.text;
      if (part.functionCall) {
        toolCalls.push({
          id: `${part.functionCall.name}-${toolCalls.length}`,
          name: part.functionCall.name,
          arguments: part.functionCall.args ?? {},
        });
      }
    }

    const tokensInput = data.usageMetadata?.promptTokenCount ?? 0;
    const tokensOutput = data.usageMetadata?.candidatesTokenCount ?? 0;
    const thoughtsTokens = data.usageMetadata?.thoughtsTokenCount;
    const { costUsd } = calculateCost(this.model, tokensInput, tokensOutput);

    const reasoningContext: ReasoningContext | undefined =
      responseParts.length > 0
        ? { provider: "gemini", data: { parts: responseParts } }
        : undefined;

    return {
      message: messageText,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: { tokensInput, tokensOutput, costUsd: costUsd ?? 0 },
      reasoningTokens: typeof thoughtsTokens === "number" ? thoughtsTokens : undefined,
      reasoningContext,
      streamed: false,
    };
  }
}

/**
 * Injeta parts inteiras de turnos anteriores (Gemini) como mensagens role:"model".
 * Gemini exige reenvio exato (com thoughtSignature) em multi-turn com function calling.
 * Inserido apos a primeira user message e antes da ultima (que normalmente eh
 * a nova pergunta ou functionResponse).
 */
function injectGeminiHistory(
  contents: Array<{ role: "user" | "model"; parts: unknown[] }>,
  history: ReasoningContext[] | undefined,
): Array<{ role: "user" | "model"; parts: unknown[] }> {
  if (!history || history.length === 0) return contents;
  if (contents.length === 0) return contents;
  const modelTurns: Array<{ role: "user" | "model"; parts: unknown[] }> = [];
  for (const ctx of history) {
    if (ctx.provider !== "gemini") continue;
    const data = ctx.data as { parts?: unknown[] } | null;
    if (data?.parts && Array.isArray(data.parts) && data.parts.length > 0) {
      modelTurns.push({ role: "model", parts: data.parts });
    }
  }
  if (modelTurns.length === 0) return contents;
  // Inserir modelTurns antes da ultima mensagem da conversa.
  return [
    ...contents.slice(0, -1),
    ...modelTurns,
    contents[contents.length - 1],
  ];
}
