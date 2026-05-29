/**
 * R2-ctx: resolução da janela de contexto da resposta do agente.
 *
 * O `runAgent` já tem o `AgentSettings` carregado; ele chama `resolveContextWindow`
 * para decidir, conforme o checkpoint e a superfície (playground vs produção),
 * QUANTAS mensagens (`budget`, com trava 10..50) e QUAIS papéis (`includeSystem`)
 * o `loadHistory` deve puxar. Mantém `loadHistory` puro (sem ler settings/DB).
 *
 * Spec: docs/superpowers/specs/2026-05-29-roteamento-contextual-e-janela-de-contexto-design.md §6.
 */

/** Mesmas strings do enum Prisma `FeatureCheckpoint`, sem acoplar à UI. */
export type ContextCheckpoint = "OFF" | "PLAYGROUND" | "PRODUCTION";

export const CONTEXT_WINDOW_MIN = 10;
export const CONTEXT_WINDOW_MAX = 50;

export interface ContextWindowConfig {
  checkpoint: ContextCheckpoint;
  size: number;
  includeSystem: boolean;
}

export interface ResolvedContextWindow {
  /** Número de mensagens a puxar (0 = sem histórico). */
  budget: number;
  includeSystem: boolean;
}

/**
 * Resolve a janela efetiva.
 * - OFF: nunca aplica histórico (budget 0).
 * - PLAYGROUND: só quando a chamada é playground.
 * - PRODUCTION: sempre (bubble + WhatsApp + playground).
 * `size` é travado em [10, 50].
 */
export function resolveContextWindow(
  cfg: ContextWindowConfig,
  ctx: { isPlayground: boolean },
): ResolvedContextWindow {
  const clamped = Math.max(
    CONTEXT_WINDOW_MIN,
    Math.min(CONTEXT_WINDOW_MAX, cfg.size || 20),
  );
  const active =
    cfg.checkpoint === "PRODUCTION" ||
    (cfg.checkpoint === "PLAYGROUND" && ctx.isPlayground);
  return { budget: active ? clamped : 0, includeSystem: cfg.includeSystem };
}
