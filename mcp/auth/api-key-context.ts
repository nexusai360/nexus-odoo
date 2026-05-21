// mcp/auth/api-key-context.ts
// Antecipado do Bloco D Task D1 para destravar fixtures de teste (B-1.4).
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
 *
 * Os campos marcados com `(row as any)` ainda não existem no schema Prisma —
 * serão adicionados em B-1 (extensão do modelo ApiKey). Remover os `as any`
 * quando o schema for atualizado.
 */
export function apiKeyContextFromRow(row: ApiKey): ApiKeyContext {
  return {
    apiKeyId: row.id,
    label: row.label,
    last4: row.last4,
    capabilities: (row as any).capabilities as unknown as Capabilities,
    capabilitiesVersion: (row as any).capabilitiesVersion ?? 1,
    rateLimit: (row as any).rateLimit ?? 60,
    tenantId: (row as any).tenantId ?? null,
    allowedOrigins: ((row as any).allowedOrigins as unknown as string[]) ?? [],
    isSystemKey: (row as any).isSystemKey ?? false,
  };
}
