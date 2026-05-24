// mcp/auth/api-key-invalidator.ts
// Pub/sub Redis para invalidar entradas do cache LRU quando uma ApiKey é
// modificada no painel (Bloco L publica no canal mcp:keys:invalidated:<id>).
import type Redis from "ioredis";
import type { createApiKeyCache } from "./api-key-cache.js";
import logger from "../lib/logger.js";

const CHANNEL_PATTERN = "mcp:keys:invalidated:*";

/**
 * Inicia um subscriber Redis que escuta invalidações de chave por pattern.
 * Ao receber mensagem no canal mcp:keys:invalidated:<apiKeyId>,
 * invoca cache.invalidateByApiKeyId(apiKeyId).
 *
 * @returns objeto com stop() para encerrar o subscriber
 */
export function startApiKeyInvalidator(
  redis: Redis,
  cache: ReturnType<typeof createApiKeyCache>,
): { stop(): void } {
  // Criar um subscriber dedicado (ioredis não permite PSUBSCRIBE + comandos regulares
  // no mesmo client depois de entrar em modo subscriber)
  const sub = redis.duplicate();

  sub.on("error", (err: Error) => {
    logger.error({ err: err.message }, "[api-key-invalidator] redis error");
  });

  sub.psubscribe(CHANNEL_PATTERN, (err) => {
    if (err) {
      logger.error({ err: err.message }, "[api-key-invalidator] psubscribe failed");
    } else {
      logger.info({ pattern: CHANNEL_PATTERN }, "[api-key-invalidator] subscribed");
    }
  });

  sub.on("pmessage", (_pattern: string, channel: string, _message: string) => {
    // Canal: "mcp:keys:invalidated:<apiKeyId>"
    const prefix = "mcp:keys:invalidated:";
    if (!channel.startsWith(prefix)) return;

    const apiKeyId = channel.slice(prefix.length);
    if (!apiKeyId) return;

    logger.debug({ apiKeyId }, "[api-key-invalidator] invalidating key");
    cache.invalidateByApiKeyId(apiKeyId);
  });

  return {
    stop() {
      sub.punsubscribe(CHANNEL_PATTERN).catch(() => {});
      sub.quit().catch(() => {});
    },
  };
}
