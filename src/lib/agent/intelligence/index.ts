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

// Frente A — analise retrospectiva (Onda 2).
export { replayToolCalls } from "./tool-replayer";
export type { ReplayItem, ReplayResult } from "./tool-replayer";

export { judgeAnswer, JUDGE_VERSION } from "./quality-judge";
export type { JudgeInput, JudgeOutput } from "./quality-judge";

export { clusterRecommendations } from "./recommendation-clusterer";
export type { Cluster } from "./recommendation-clusterer";

export { embed as embedText, EmbeddingUnavailable } from "./embeddings-client";

// Frente C — continuidade contextual (Onda 4).
export { suggestContinuation } from "./contextual-suggester";
export type {
  SuggestContinuationInput,
  SuggestContinuationResult,
} from "./contextual-suggester";
