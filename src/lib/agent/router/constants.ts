// R1 router de catalogo: constantes de operacao compartilhadas.

/**
 * Acerto minimo de Top-1 (dominio correto em primeiro) para o router ser
 * considerado apto a ser ativado em producao (sai do shadow).
 *
 * Meta elevada de 0.85 para 0.95 por decisao do usuario (2026-05-28): o router
 * so entra em producao quando estiver acertando o dominio em 95% das perguntas,
 * o mesmo patamar de qualidade exigido do Agente Nex.
 */
export const ROUTER_PROMOTION_MIN_TOP1 = 0.95;

/** Mesma meta em pontos percentuais (para KPIs que trabalham em %). */
export const ROUTER_PROMOTION_MIN_TOP1_PCT = ROUTER_PROMOTION_MIN_TOP1 * 100;

/** Numero minimo de decisoes em shadow antes de considerar a ativacao. */
export const ROUTER_PROMOTION_MIN_DECISIONS = 200;
