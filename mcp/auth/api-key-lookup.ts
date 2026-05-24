// mcp/auth/api-key-lookup.ts
// Busca e valida uma ApiKey pelo keyHash (SHA-256 do token raw).
// Retorna ApiKeyContext se válida, null se inexistente/inativa/expirada/revogada.
import type { PrismaClient } from "@/generated/prisma/client";
import { apiKeyContextFromRow, type ApiKeyContext } from "./api-key-context.js";
import logger from "../lib/logger.js";

export type ApiKeyLookupResult =
  | { ok: true; context: ApiKeyContext }
  | { ok: false; reason: "not_found" | "inactive" | "expired" | "revoked" };

/**
 * Busca uma ApiKey pelo keyHash (SHA-256 do token bruto) e valida seu estado.
 * O parâmetro é nomeado tokenHash externamente; internamente usa-se keyHash no DB.
 * Não toca o Odoo , lê apenas do Postgres cache.
 */
export async function lookupApiKey(
  prisma: PrismaClient,
  tokenHash: string,
): Promise<ApiKeyContext | null> {
  const row = await prisma.apiKey.findUnique({
    where: { keyHash: tokenHash },
  });

  if (!row) {
    logger.debug({ keyHashPrefix: tokenHash.slice(0, 8) + "..." }, "api-key not found");
    return null;
  }

  if (row.revokedAt !== null) {
    logger.debug({ apiKeyId: row.id }, "api-key revoked");
    return null;
  }

  if (row.expiresAt !== null && row.expiresAt < new Date()) {
    logger.debug({ apiKeyId: row.id, expiresAt: row.expiresAt }, "api-key expired");
    return null;
  }

  if (!row.active) {
    logger.debug({ apiKeyId: row.id }, "api-key inactive");
    return null;
  }

  return apiKeyContextFromRow(row);
}

/**
 * Versão completa com motivo de rejeição , útil para audit log interno.
 */
export async function lookupApiKeyWithReason(
  prisma: PrismaClient,
  tokenHash: string,
): Promise<ApiKeyLookupResult> {
  const row = await prisma.apiKey.findUnique({
    where: { keyHash: tokenHash },
  });

  if (!row) return { ok: false, reason: "not_found" };
  if (row.revokedAt !== null) return { ok: false, reason: "revoked" };
  if (row.expiresAt !== null && row.expiresAt < new Date()) return { ok: false, reason: "expired" };
  if (!row.active) return { ok: false, reason: "inactive" };

  return { ok: true, context: apiKeyContextFromRow(row) };
}
