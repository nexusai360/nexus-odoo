// R1 router de catalogo: helper isolado para o motor de retry V1-V5 decidir
// quando expandir o catalogo de tools de volta ao integral.
//
// Spec: docs/superpowers/specs/2026-05-28-router-catalogo-design.md §9.
// Plan: docs/superpowers/plans/2026-05-28-router-catalogo-plan.md §C2.
//
// Funcao pura sem efeitos colaterais — facil de testar em isolamento.
// O ponto de integracao real (chamada de `maybeExpandCatalogAndRetry` dentro
// do loop do auto-validator) so e' relevante em modo ATIVO
// (`routerEnabled = true`). Em shadow mode (default), nunca dispara.

import type { RouterDecision } from "../router/types";

/** Razao reportada pelo auto-validator quando a resposta do LLM nao tem
 *  metrica (Caminho 3a do CLAUDE.md §5). String estavel cross-version. */
export type ValidatorReason =
  | "sem_metrica"
  | string
  | null
  | undefined;

/** Input do helper. */
export type MaybeExpandInput<T = unknown> = {
  /** Resposta do validator V1-V5. */
  validatorReason: ValidatorReason;
  /** RouterDecision capturado no inicio do turno (pickDomains). */
  routerDecision: RouterDecision;
  /** Catalogo inteiro de tools, ja sanitizado, pronto para reentregar ao LLM
   *  na nova chamada de retry. */
  allTools: T[];
  /** Threshold abaixo do qual o router e' considerado "pouco confiante" no
   *  topo. Vem de `AgentSettings.routerRetryExpandBelow`. Faixa 0.30-0.95. */
  expandThreshold: number;
  /** Master switch: feature flag em `AgentSettings.routerRetryEnabled`.
   *  Quando false, helper retorna null sem importar o resto. */
  routerRetryEnabled: boolean;
  /** Modo do router neste turno. Helper so dispara em "active". */
  routerMode: "shadow" | "active" | string;
};

/** Saida do helper. `null` significa: "fluxo normal, sem retry expandido". */
export type MaybeExpandOutput<T = unknown> = {
  shouldRetry: true;
  expandedCatalog: T[];
  /** String anexada ao `fallbackReason` em AgentRouterDecision para auditoria. */
  fallbackReasonSuffix: "+retry_v5_expanded";
} | null;

/** Decide se o motor V1-V5 deve disparar 1 retry corretivo com o catalogo
 *  INTEIRO em vez do filtrado. Cobre o caso onde o router pode ter filtrado
 *  errado e o LLM acabou respondendo "sem metrica" — talvez a tool certa
 *  esteja fora dos dominios escolhidos.
 *
 *  Condicoes (todas precisam ser verdadeiras, em ordem):
 *   1. Feature flag `routerRetryEnabled = true`.
 *   2. `routerMode === "active"` (em shadow, catalogo ja' era inteiro).
 *   3. validator reportou `"sem_metrica"`.
 *   4. router NAO estava em fallback (catalogo NAO era inteiro).
 *   5. topScore < expandThreshold (router pouco confiante no topo). */
export function maybeExpandCatalogAndRetry<T = unknown>(
  input: MaybeExpandInput<T>,
): MaybeExpandOutput<T> {
  const {
    validatorReason,
    routerDecision,
    allTools,
    expandThreshold,
    routerRetryEnabled,
    routerMode,
  } = input;

  // Cond 1: master switch.
  if (!routerRetryEnabled) return null;

  // Cond 2: so em active mode.
  if (routerMode !== "active") return null;

  // Cond 3: so quando validator detectou sem_metrica.
  if (validatorReason !== "sem_metrica") return null;

  // Cond 4: se ja' tinha fallback (catalogo inteiro), nao reentrega.
  if (routerDecision.fallback.triggered) return null;

  // Cond 5: router confiante no topo nao deve expandir.
  const topScore = routerDecision.topScore ?? 0;
  if (topScore >= expandThreshold) return null;

  return {
    shouldRetry: true,
    expandedCatalog: allTools,
    fallbackReasonSuffix: "+retry_v5_expanded",
  };
}
