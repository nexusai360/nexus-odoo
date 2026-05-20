/**
 * Factory de cliente LLM.
 *
 * Portado de nexus-insights/src/lib/llm/get-client.ts.
 */

import { AnthropicClient } from "./providers/anthropic";
import { GeminiClient } from "./providers/gemini";
import { OpenAIClient } from "./providers/openai";
import { OpenRouterClient } from "./providers/openrouter";
import type { LlmProvider, ProviderClient } from "./types";

export function buildLlmClient(
  provider: LlmProvider,
  apiKey: string,
  model: string,
): ProviderClient {
  switch (provider) {
    case "openai":
      return new OpenAIClient(apiKey, model);
    case "anthropic":
      return new AnthropicClient(apiKey, model);
    case "gemini":
      return new GeminiClient(apiKey, model);
    case "openrouter":
      return new OpenRouterClient(apiKey, model);
  }
}
