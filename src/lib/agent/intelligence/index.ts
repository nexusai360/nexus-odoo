/**
 * Barrel exports do modulo de inteligencia do Agente Nex.
 *
 * Spec canonica: docs/superpowers/specs/2026-05-25-agente-nex-inteligencia-design.md (v3).
 */

export { normalizeToolHistory } from "./normalize-tool-history";
export type {
  NormalizedToolCall,
  NormalizedToolHistory,
  ToolResultsMap,
} from "./normalize-tool-history";

export { getReasoningEffortForCaller } from "./reasoning-effort-policy";
export type { IntelligenceCaller } from "./reasoning-effort-policy";

export { extractTopics } from "./topic-extractor";
export type { TopicExtractionResult } from "./topic-extractor";
