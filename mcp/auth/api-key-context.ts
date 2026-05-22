// mcp/auth/api-key-context.ts
// Tipos e helper de conversão de ApiKey → ApiKeyContext.
// Lookup / cache LRU / validações (active/expired/revoked) vêm no Bloco D.

import type { ApiKey } from "@/generated/prisma/client";

export interface Capabilities {
  version: number;
  read: string[];
  write: Record<string, string[]>;
}

export interface ApiKeyContext {
  apiKeyId: string;
  label: string;
  last4: string;
  capabilities: Capabilities;
  capabilitiesVersion: number;
  rateLimit: number;
  tenantId: string | null;
  allowedOrigins: string[];
  isSystemKey: boolean;
}

/**
 * Converte um row do Prisma em ApiKeyContext.
 * Bloco D adicionará lookup, cache LRU e validações (active/expired/revoked).
 */
export function apiKeyContextFromRow(row: ApiKey): ApiKeyContext {
  return {
    apiKeyId: row.id,
    label: row.label,
    last4: row.last4,
    capabilities: row.capabilities as unknown as Capabilities,
    capabilitiesVersion: row.capabilitiesVersion,
    rateLimit: row.rateLimit,
    tenantId: row.tenantId,
    allowedOrigins: (row.allowedOrigins as unknown as string[]) ?? [],
    isSystemKey: row.isSystemKey,
  };
}
