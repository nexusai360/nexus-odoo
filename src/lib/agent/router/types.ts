// R1 router de catalogo: tipos compartilhados.
//
// Spec: docs/superpowers/specs/2026-05-28-router-catalogo-design.md §5 §8.

/** Resultado de `pickDomains(question, ctx)`. Capturado em
 *  `AgentRouterDecision` para auditoria. */
export type RouterDecision = {
  /** Conjunto final de dominios escolhidos pelo router. Inclui dominios com
   *  score >= threshold (top-K), dominios com excludeFromFiltering=true,
   *  dominios match em forceIncludeOn. Em fallback, vazio. */
  pickedDomains: string[];
  /** {dominio: cosineSimilarity}. Pode ser `{}` em fallbacks tipo
   *  "msg_trivial" ou "embed_failed" (embedding nao foi computado). */
  scores: Record<string, number>;
  /** Maximo de `scores` (denormalizado para query de histograma).
   *  null quando `scores` vazio. */
  topScore: number | null;
  /** Status do fallback. Quando `triggered=true`, o caller deve expor
   *  catalogo inteiro ao LLM (ver filter-catalog). */
  fallback: {
    triggered: boolean;
    reason?: "msg_trivial" | "embed_failed" | "score_baixo";
  };
  /** Tempo de execucao de `pickDomains` em ms (so o pick, nao o turno). */
  pickDurationMs: number;
  /** Formato: "r1.<major>.<minor>.<patch>-<vocab_hash8>". Cruza com
   *  VOCABULARY_VERSION para reanalise comparativa entre versoes. */
  routerVersion: string;
};

/** Forma minimalista de uma tool MCP que o agente recebe do servidor.
 *  Definicao real esta em mcp/catalog/types.ts (`ToolEntry`). Este shape
 *  serve apenas para tipar filter-catalog sem criar dep circular. */
export type CatalogTool = {
  name: string;
  description?: string;
};

/** Input de `filterCatalog`. */
export type FilterCatalogInput = {
  allTools: CatalogTool[];
  decision: RouterDecision;
  routerEnabled: boolean;
};

/** Output de `filterCatalog`. Quando `routerEnabled=false` ou fallback
 *  triggered, retorna `allTools` na integra. */
export type FilterCatalogOutput = {
  tools: CatalogTool[];
  /** Diagnostico: quantas tools entraram, e a que dominios pertencem. */
  diagnostic: {
    totalIn: number;
    totalOut: number;
    domainsRepresented: string[];
    filtered: boolean;
  };
};

/** Settings populados de `AgentSettings` antes de chamar `pickDomains`. */
export type RouterSettings = {
  threshold: number;
  topK: number;
};
