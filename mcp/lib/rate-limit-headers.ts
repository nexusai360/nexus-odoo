// mcp/lib/rate-limit-headers.ts
// Bloco G , G2.
// Constrói os headers HTTP padrão de rate limit a partir do resultado de
// checkMcpRateLimitFor.  Usado pelo handler HTTP do servidor MCP para
// incluir cabeçalhos informativos em todas as respostas.

export interface RateLimitHeadersInput {
  limit: number;
  remaining: number;
  resetAt: Date;
}

export interface RateLimitHeaders {
  "X-RateLimit-Limit": string;
  "X-RateLimit-Remaining": string;
  "X-RateLimit-Reset": string; // Unix timestamp em segundos (string)
}

/**
 * Retorna os três headers HTTP padrão de rate limit.
 *
 * - `X-RateLimit-Limit`     , limite configurado para a janela
 * - `X-RateLimit-Remaining` , requisições restantes nesta janela
 * - `X-RateLimit-Reset`     , Unix timestamp (segundos) em que a janela reinicia
 */
export function rateLimitHeaders(input: RateLimitHeadersInput): RateLimitHeaders {
  return {
    "X-RateLimit-Limit": String(input.limit),
    "X-RateLimit-Remaining": String(Math.max(0, input.remaining)),
    "X-RateLimit-Reset": String(Math.floor(input.resetAt.getTime() / 1000)),
  };
}
