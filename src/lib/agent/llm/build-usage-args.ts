import type { ChatResult } from "./types";
import type { LogUsageArgs } from "./usage-logger";

/** Origem da chamada LLM dentro de um turno do agente (tag "Origem" no consumo). */
export const ORIGENS = {
  LOOP: "loop_principal",
  ENHANCE: "enhance",
  GUARDRAIL: "guardrail",
  AUTO_VALIDATOR: "auto_validator",
} as const;

export type Origem = (typeof ORIGENS)[keyof typeof ORIGENS];

export interface UsageBase {
  provider: string;
  model: string;
  credentialId?: string;
  conversationId?: string;
  userId?: string;
  isPlayground?: boolean;
  durationMs?: number;
  promptChars?: number;
  responseChars?: number;
}

/**
 * Monta LogUsageArgs a partir de um ChatResult de uma chamada LLM de
 * pos-processamento (enhance/guardrail/autoValidator). Puro e testavel.
 */
export function buildUsageArgs(result: ChatResult, base: UsageBase, origin: Origem): LogUsageArgs {
  return {
    provider: base.provider,
    model: base.model,
    credentialId: base.credentialId,
    conversationId: base.conversationId,
    userId: base.userId,
    isPlayground: base.isPlayground ?? false,
    tokensInput: result.usage.tokensInput,
    tokensOutput: result.usage.tokensOutput,
    tokensCachedInput: result.usage.tokensCachedInput ?? 0,
    reasoningTokens: result.reasoningTokens ?? null,
    toolCallsCount: result.toolCalls?.length ?? 0,
    toolNames: result.toolCalls?.map((t) => t.name) ?? [],
    durationMs: base.durationMs,
    promptChars: base.promptChars,
    responseChars: base.responseChars ?? result.message.length,
    origin,
  };
}
