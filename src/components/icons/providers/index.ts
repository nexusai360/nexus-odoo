import type { ComponentType, SVGProps } from "react";

import { AnthropicIcon } from "./anthropic-icon";
import { GeminiIcon } from "./gemini-icon";
import { OpenAIIcon } from "./openai-icon";
import { OpenRouterIcon } from "./openrouter-icon";

export type ProviderIconKey = "openai" | "anthropic" | "gemini" | "openrouter";

const MAP: Record<ProviderIconKey, ComponentType<SVGProps<SVGSVGElement>>> = {
  openai: OpenAIIcon,
  anthropic: AnthropicIcon,
  gemini: GeminiIcon,
  openrouter: OpenRouterIcon,
};

export function getProviderIcon(
  provider: string,
): ComponentType<SVGProps<SVGSVGElement>> | null {
  if (provider in MAP) return MAP[provider as ProviderIconKey];
  return null;
}

export { AnthropicIcon, GeminiIcon, OpenAIIcon, OpenRouterIcon };
