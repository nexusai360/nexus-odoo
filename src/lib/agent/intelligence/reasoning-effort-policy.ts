/**
 * Politica centralizada de `reasoningEffort` para chamadas LLM INTERNAS
 * desta entrega de inteligencia.
 *
 * Importante: este modulo NAO mexe com `AgentSettings.reasoningEffort` nem
 * com `reasoningCheckpoint` — essas configuracoes controlam o agente
 * principal de chat, nao as chamadas backend de inteligencia.
 *
 * Spec: docs/superpowers/specs/2026-05-25-agente-nex-inteligencia-design.md §9.5
 */

import type { ReasoningEffort } from "@/lib/agent/llm/types";

export type IntelligenceCaller =
  | "topic-extractor"
  | "contextual-suggester"
  | "quality-judge"
  | "recommendation-clusterer";

/**
 * Retorna o `reasoningEffort` adequado para cada chamador.
 *
 * - `topic-extractor` / `contextual-suggester` / `recommendation-clusterer`:
 *   modelos baratos (Haiku 4.5 / Gemini Flash). Reasoning off por default —
 *   tarefas simples + Haiku nao suporta.
 * - `quality-judge`: modelo de raciocinio profundo (Gemini 2.5 Pro thinking
 *   ou Opus 4.7). Reasoning HIGH e o ponto da feature.
 */
export function getReasoningEffortForCaller(
  caller: IntelligenceCaller,
): ReasoningEffort | undefined {
  switch (caller) {
    case "quality-judge":
      return "high";
    case "topic-extractor":
    case "contextual-suggester":
    case "recommendation-clusterer":
      return undefined;
  }
}
