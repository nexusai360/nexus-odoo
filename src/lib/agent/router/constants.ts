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

/**
 * Modelo de embedding DO ROUTER. Separado do default do embed() (small/1536),
 * que o RAG da F5 usa com vetores pgvector(1536) ja persistidos: trocar o
 * default quebraria o RAG. O router roda em memoria, entao pode usar o modelo
 * mais forte (large/3072), que na calibragem deu Top-1 ~78% / Top-K ~93,5%
 * contra ~64% / ~76% do small.
 *
 * Override por env (EMBEDDING_MODEL / EMBEDDING_DIMENSIONS) para A/B testing
 * na calibragem; em producao usa os defaults abaixo.
 */
export function getRouterEmbeddingConfig(): {
  model: string;
  dimensions: number;
} {
  const model = process.env.EMBEDDING_MODEL ?? "text-embedding-3-large";
  const envDims = process.env.EMBEDDING_DIMENSIONS;
  const dimensions =
    envDims && !Number.isNaN(Number(envDims))
      ? Number(envDims)
      : model.includes("large")
        ? 3072
        : 1536;
  return { model, dimensions };
}
