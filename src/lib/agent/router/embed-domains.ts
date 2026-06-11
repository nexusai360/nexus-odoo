// R1 router de catalogo: cache em memoria dos vetores de cada dominio.
//
// Spec: docs/superpowers/specs/2026-05-28-router-catalogo-design.md §4.4 §4.5.
// O cache invalida quando VOCABULARY_VERSION muda (mudanca em descriptions).
// Promise sharing evita race condition em cold start (duas chamadas
// simultaneas geram so 1 embedding por dominio).
//
// Storage em memoria do processo: 9 dominios x 1536 floats x 4 bytes ~= 55 KB.

import { embedMany } from "../rag/embed";
import { getRouterEmbeddingConfig } from "./constants";
import {
  DOMAINS,
  computeVocabularyHash,
  getVocabularyVersion,
} from "./domain-vocabulary";

type DomainVectors = Record<string, number[]>;

let cachedHash: string | null = null;
let cachedVectors: DomainVectors | null = null;
let pendingPromise: Promise<DomainVectors> | null = null;

/** Batch: 1 chamada para todos os domínios (mesmo modelo/dimensao da pergunta
 *  em embed-question, senao o cosseno fica sem sentido). So acontece 1x por
 *  processo. Sem usageCtx: o warm de dominios e' 1x por processo. */
async function embedAllDomains(): Promise<DomainVectors> {
  const { model, dimensions } = getRouterEmbeddingConfig();
  const vectors = await embedMany(
    DOMAINS.map((d) => d.description),
    { model, dimensions },
  );
  const out: DomainVectors = {};
  DOMAINS.forEach((d, i) => {
    out[d.domain] = vectors[i];
  });
  return out;
}

/** Retorna o vetor de cada dominio, computado uma unica vez por processo
 *  (ou quando o vocabulario muda). Race-safe: chamadas concorrentes em cold
 *  start compartilham a mesma promise. */
export async function getDomainVectors(): Promise<DomainVectors> {
  const currentHash = computeVocabularyHash();

  // Cache valido para esta versao.
  if (cachedHash === currentHash && cachedVectors !== null) {
    return cachedVectors;
  }

  // Outra chamada ja esta computando — compartilha a promise.
  if (pendingPromise !== null) {
    return pendingPromise;
  }

  // Cold start (ou invalidacao por mudanca de vocab). Carrega e cacheia.
  pendingPromise = embedAllDomains()
    .then((vectors) => {
      cachedVectors = vectors;
      cachedHash = currentHash;
      return vectors;
    })
    .finally(() => {
      pendingPromise = null;
    });

  return pendingPromise;
}

/** Reset apenas para testes. NAO usar em runtime de producao. */
export function __resetDomainCache(): void {
  cachedHash = null;
  cachedVectors = null;
  pendingPromise = null;
}

/** Retorna a versao do vocabulario que foi usada no cache atual.
 *  Util para logging/telemetria. */
export function getCachedVocabularyVersion(): string {
  return getVocabularyVersion();
}
