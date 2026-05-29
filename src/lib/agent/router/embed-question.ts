// R1 router de catalogo: cache LRU em memoria de embeddings de perguntas.
//
// Spec: docs/superpowers/specs/2026-05-28-router-catalogo-design.md §4.5.
// 200 entradas, LRU puro, sem dependencia externa (decisao P3 do PLAN v2).
// Pequena duplicacao em race de mesma pergunta concorrente e' aceitavel
// (custo ~$0.000002 por colisao).

import { embed, type EmbedUsageContext } from "../rag/embed";
import { hashKey, normalize } from "./question-normalize";

/** LRU minimalista baseado em Map. Map em JS preserva ordem de insercao, o
 *  que da insertion-order. Na get(), removemos e reinsertimos para reordenar. */
class LRU<K, V> {
  private readonly cap: number;
  private readonly map = new Map<K, V>();

  constructor(capacity: number) {
    if (capacity <= 0) throw new Error("LRU capacity deve ser > 0");
    this.cap = capacity;
  }

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    // Reordena: remove e reinsere para marcar como mais recente.
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.cap) {
      // Eject o mais antigo (primeira chave da Map).
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, value);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}

const LRU_CAPACITY = 200;
const cache = new LRU<string, number[]>(LRU_CAPACITY);

export type EmbedQuestionResult = {
  vector: number[];
  cacheHit: boolean;
};

/** Embeda a pergunta do usuario via cache LRU.
 *  Lookup pela chave SHA1 16 chars do `normalize(q)`.
 *  `usageCtx` (opcional) faz a chamada aparecer no menu de consumo. So conta
 *  custo quando ha cache miss (uma chamada real de embedding). */
export async function embedQuestion(
  question: string,
  usageCtx?: EmbedUsageContext,
): Promise<EmbedQuestionResult> {
  const qNorm = normalize(question);
  const key = hashKey(qNorm);

  const cached = cache.get(key);
  if (cached !== undefined) {
    return { vector: cached, cacheHit: true };
  }

  const vector = await embed(qNorm, usageCtx ? { usage: usageCtx } : undefined);
  cache.set(key, vector);
  return { vector, cacheHit: false };
}

/** Reset para testes. NAO usar em runtime. */
export function __resetQuestionCache(): void {
  cache.clear();
}

/** Tamanho atual do cache, util para telemetria. */
export function getQuestionCacheSize(): number {
  return cache.size;
}

/** Capacidade configurada do cache. */
export function getQuestionCacheCapacity(): number {
  return LRU_CAPACITY;
}
