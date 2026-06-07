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

/** Shape minimo que uma tool precisa para passar pelo router (apenas o nome
 *  e' relevante para o filtro). Generico para preservar o tipo real chamador
 *  (`McpTool` no run-agent, etc). */
export type CatalogTool = { name: string };

/** F3 (retrieval): tool com nome + descricao (= embeddingText publicado em
 *  tools/list). O retrieval vetoriza a `description`. */
export type RetrievalTool = { name: string; description: string };

/** F3 (retrieval): resultado de `pickTools`. `picked` = nomes do catalogo enxuto
 *  (nucleo minimo + top-K). `scores` = cosseno por nome (telemetria/shadow).
 *  `floorAdded` = nomes que entraram so pelo piso (fora do top-K por score). */
export type ToolRetrievalResult = {
  picked: string[];
  scores: Record<string, number>;
  floorAdded: string[];
};

/** Input de `filterCatalog`, generico no tipo da tool.
 *
 *  RBAC v2 (SPEC §6.1): camada B com `userAllowedDomains`. Quando ausente
 *  ou `"all"`: backwards-compat (sem corte por permissão). */
export type FilterCatalogInput<T extends CatalogTool = CatalogTool> = {
  allTools: T[];
  decision: RouterDecision;
  routerEnabled: boolean;
  /** RBAC v2: conjunto de domínios que o usuário logado pode ver
   *  (`UserDomainAccess`). Quando `"all"`, super_admin/admin (sem corte).
   *  Quando `Set<string>`, corta toda tool cujo domínio não está no set
   *  (exceto `EXCLUDE_FROM_FILTERING` e `UNKNOWN_DOMAIN`, que passam sempre).
   *  Camada B é aplicada SEMPRE, independente do shadow do Router. */
  userAllowedDomains?: Set<string> | "all";
  /** F3 (camada C): quando presente, apos RBAC (camada B) o catalogo e reduzido
   *  aos nomes em `picked` (retrieval de tool, modo active). Ausente => sem corte
   *  de retrieval (shadow/fallback). RBAC sempre antes; nunca reintroduz tool
   *  cortada por permissao. */
  toolRetrieval?: { picked: ReadonlySet<string> };
};

/** Output de `filterCatalog`. Quando `routerEnabled=false` ou fallback
 *  triggered, a camada A não filtra. A camada B do RBAC v2 ainda corta
 *  por `userAllowedDomains` se presente. */
export type FilterCatalogOutput<T extends CatalogTool = CatalogTool> = {
  tools: T[];
  /** Diagnostico: quantas tools entraram, e a que dominios pertencem. */
  diagnostic: {
    totalIn: number;
    totalOut: number;
    domainsRepresented: string[];
    /** True quando a camada A do Router cortou tools. */
    filtered: boolean;
    /** RBAC v2: quantas tools foram cortadas pela camada B (gate de permissão). */
    permissionFilteredOut: number;
    /** F3: true quando a camada C (retrieval) reduziu o catalogo (modo active). */
    retrievalApplied?: boolean;
  };
};

/** Settings populados de `AgentSettings` antes de chamar `pickDomains`. */
export type RouterSettings = {
  threshold: number;
  topK: number;
};
