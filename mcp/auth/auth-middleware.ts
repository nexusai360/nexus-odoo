// mcp/auth/auth-middleware.ts
// Middleware de autenticação unificado do servidor MCP.
// Distingue Bearer interno (timingSafeEqual contra MCP_SERVICE_TOKEN)
// de Bearer externo (lookup ApiKey via cache LRU).
// Recusa token em URL/body (D7) e mascara token em logs (D8).
import { createHash, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import type { ApiKeyContext } from "./api-key-context.js";
import type { ApiKeyCache } from "./api-key-cache.js";
import { lookupApiKey } from "./api-key-lookup.js";
import { sha256hex } from "../lib/crypto.js";
import { maskBearerHeader } from "../lib/logger.js";
import logger from "../lib/logger.js";

export type AuthResult =
  | { mode: "internal"; userId: string }
  | { mode: "external"; apiKey: ApiKeyContext }
  | {
      mode: "unauthorized";
      reason:
        | "invalid_token"
        | "expired"
        | "revoked"
        | "missing_user_id"
        | "token_in_unsafe_location";
    };

/**
 * Detecta se um token Bearer está em local inseguro (URL ou body).
 * Recusa imediatamente com "token_in_unsafe_location" (D7).
 */
function detectUnsafeTokenLocation(opts: {
  requestUrl?: string;
  bodyKeys?: string[];
}): boolean {
  const url = opts.requestUrl ?? "";
  // Token na query string? Qualquer "token" ou "Bearer" na URL é suspeito
  if (url.includes("token=") || url.includes("Bearer%20") || url.includes("bearer=")) {
    return true;
  }
  // Token em campos do body
  const sensitiveKeys = ["token", "authorization", "bearer", "api_key", "apikey"];
  for (const key of opts.bodyKeys ?? []) {
    if (sensitiveKeys.includes(key.toLowerCase())) return true;
  }
  return false;
}

/**
 * Compara um token fornecido contra MCP_SERVICE_TOKEN usando timingSafeEqual
 * sobre hashes SHA-256 (comprimento fixo = sem vazamento de tamanho).
 */
function isServiceToken(provided: string): boolean {
  const expected = process.env.MCP_SERVICE_TOKEN;
  if (!expected) return false;
  const expectedBuf = createHash("sha256").update(expected, "utf8").digest();
  const providedBuf = createHash("sha256").update(provided, "utf8").digest();
  return timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Autentica uma requisição ao servidor MCP.
 *
 * Ordem:
 * 1. Sem header ou sem "Bearer " → unauthorized "invalid_token"
 * 2. Token em local inseguro → unauthorized "token_in_unsafe_location"
 * 3. timingSafeEqual contra MCP_SERVICE_TOKEN:
 *    - Match + sem X-User-Id → unauthorized "missing_user_id"
 *    - Match + userId presente → internal
 *    - Mismatch → lookup ApiKey via cache → external | unauthorized
 */
export async function authenticate(
  prisma: PrismaClient,
  cache: ApiKeyCache,
  opts: {
    headerAuth: string | undefined;
    headerUserId: string | undefined;
    requestUrl?: string;
    bodyKeys?: string[];
  },
): Promise<AuthResult> {
  const { headerAuth, headerUserId, requestUrl, bodyKeys } = opts;

  // Step 1: header ausente ou malformado
  if (!headerAuth || !headerAuth.startsWith("Bearer ")) {
    logger.debug(
      { authHeader: maskBearerHeader(headerAuth) },
      "auth: missing or malformed Authorization header",
    );
    return { mode: "unauthorized", reason: "invalid_token" };
  }

  // Step 2: token em local inseguro (D7)
  if (detectUnsafeTokenLocation({ requestUrl, bodyKeys })) {
    logger.warn({ requestUrl }, "auth: token detected in unsafe location");
    return { mode: "unauthorized", reason: "token_in_unsafe_location" };
  }

  const rawToken = headerAuth.slice("Bearer ".length);

  // Step 3: verificar service token interno
  if (isServiceToken(rawToken)) {
    if (!headerUserId || headerUserId.trim() === "") {
      logger.warn("auth: internal token matched but X-User-Id missing");
      return { mode: "unauthorized", reason: "missing_user_id" };
    }
    logger.debug({ userId: headerUserId }, "auth: internal token accepted");
    return { mode: "internal", userId: headerUserId.trim() };
  }

  // Step 4: lookup externo via cache
  const tokenHash = sha256hex(rawToken);
  const apiKey = await cache.getOrLoad(tokenHash, () =>
    lookupApiKey(prisma, tokenHash),
  );

  if (!apiKey) {
    logger.debug(
      { tokenMasked: maskBearerHeader(headerAuth) },
      "auth: external api key not found or invalid",
    );
    return { mode: "unauthorized", reason: "invalid_token" };
  }

  logger.debug({ apiKeyId: apiKey.apiKeyId }, "auth: external api key accepted");
  return { mode: "external", apiKey };
}
