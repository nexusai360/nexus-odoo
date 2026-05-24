// mcp/middleware/cors.ts
// CORS middleware opt-in por chave de API via allowedOrigins.
// Default fechado: sem ApiKeyContext ou sem requestOrigin → sem headers CORS.
// Whitelist por ApiKey: allowedOrigins[] vazio → fechado; origin na lista → liberado.
import type { ApiKeyContext } from "../auth/api-key-context.js";

const ALLOWED_METHODS = "POST, OPTIONS, GET";
const ALLOWED_HEADERS = "Authorization, Content-Type, Idempotency-Key, If-Unmodified-Since";

/**
 * Retorna os headers CORS para uma requisição, se aplicável.
 * Default fechado , retorna {} se origem não está na whitelist.
 */
export function corsHeaders(opts: {
  requestOrigin?: string;
  apiKey?: ApiKeyContext;
}): Record<string, string> {
  const { requestOrigin, apiKey } = opts;

  // Sem chave ou sem origin → sem CORS
  if (!apiKey || !requestOrigin) return {};

  // Whitelist vazia → fechado por default
  const allowed = apiKey.allowedOrigins;
  if (!allowed || allowed.length === 0) return {};

  // Origin na whitelist → liberado
  if (allowed.includes(requestOrigin)) {
    return {
      "Access-Control-Allow-Origin": requestOrigin,
      Vary: "Origin",
      "Access-Control-Allow-Methods": ALLOWED_METHODS,
      "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    };
  }

  // Origin fora da whitelist → sem headers
  return {};
}

/**
 * Lida com preflight OPTIONS.
 * Retorna 204 se a origin é permitida, 403 caso contrário.
 */
export function handlePreflight(opts: {
  requestOrigin?: string;
  apiKey?: ApiKeyContext;
}): { status: 204 | 403; headers: Record<string, string> } {
  const headers = corsHeaders(opts);

  if (Object.keys(headers).length === 0) {
    return { status: 403, headers: {} };
  }

  return {
    status: 204,
    headers: {
      ...headers,
      "Access-Control-Max-Age": "86400",
    },
  };
}
