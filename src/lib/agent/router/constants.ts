// R1 router de catalogo: constantes de operacao compartilhadas.

/**
 * Cobertura minima (Top-K) para o router ser apto a ativacao em producao.
 *
 * Metrica = o dominio certo esta entre os entregues ao LLM (na calibragem,
 * topKAccuracy; em producao, allInTopKPct = todas as tools usadas cobertas).
 * E' o que importa de fato, inclusive em perguntas multi-dominio: a IA recebe
 * os top-K dominios, entao basta o dominio certo estar entre eles. O Top-1
 * (palpite #1 exato) e' mais rigido do que o necessario e fica como KPI
 * secundario.
 *
 * Meta elevada de 0.85 para 0.95 por decisao do usuario (2026-05-28): mesmo
 * patamar de qualidade exigido do Agente Nex.
 */
export const ROUTER_PROMOTION_MIN_COVERAGE = 0.95;

/** Mesma meta em pontos percentuais (para KPIs que trabalham em %). */
export const ROUTER_PROMOTION_MIN_COVERAGE_PCT =
  ROUTER_PROMOTION_MIN_COVERAGE * 100;

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
