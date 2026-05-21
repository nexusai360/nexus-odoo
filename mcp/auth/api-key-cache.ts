// mcp/auth/api-key-cache.ts
// Cache LRU com TTL para ApiKeyContext — evita round-trips ao Postgres
// a cada requisição. Invalidado por pub/sub Redis (Bloco D5).
import { LRUCache } from "lru-cache";
import type { ApiKeyContext } from "./api-key-context.js";

export interface ApiKeyCache {
  getOrLoad(
    keyHash: string,
    loader: () => Promise<ApiKeyContext | null>,
  ): Promise<ApiKeyContext | null>;
  invalidate(keyHash: string): void;
  invalidateByApiKeyId(apiKeyId: string): void;
}

/**
 * Cria uma instância de cache LRU com TTL para ApiKeyContext.
 * @param opts.ttlMs TTL em milissegundos (default: 60_000)
 * @param opts.maxSize Máximo de entradas (default: 500)
 */
export function createApiKeyCache(
  opts: { ttlMs?: number; maxSize?: number } = {},
): ApiKeyCache {
  const ttlMs = opts.ttlMs ?? 60_000;
  const maxSize = opts.maxSize ?? 500;

  // Cache principal: keyHash → ApiKeyContext
  const cache = new LRUCache<string, ApiKeyContext>({
    max: maxSize,
    ttl: ttlMs,
  });

  // Índice reverso: apiKeyId → keyHash (para invalidação por ID)
  const idToHash = new Map<string, string>();

  return {
    async getOrLoad(
      keyHash: string,
      loader: () => Promise<ApiKeyContext | null>,
    ): Promise<ApiKeyContext | null> {
      const cached = cache.get(keyHash);
      if (cached !== undefined) return cached;

      const result = await loader();
      if (result !== null) {
        cache.set(keyHash, result);
        idToHash.set(result.apiKeyId, keyHash);
      }
      return result;
    },

    invalidate(keyHash: string): void {
      const entry = cache.get(keyHash);
      if (entry) {
        idToHash.delete(entry.apiKeyId);
      }
      cache.delete(keyHash);
    },

    invalidateByApiKeyId(apiKeyId: string): void {
      const hash = idToHash.get(apiKeyId);
      if (hash) {
        cache.delete(hash);
        idToHash.delete(apiKeyId);
      }
    },
  };
}
