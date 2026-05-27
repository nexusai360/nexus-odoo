/* eslint-disable @typescript-eslint/no-explicit-any */
// mcp/__tests__/fixtures/contexts.ts
// Factories de contexto para testes unitários do MCP semântico.
// ApiKeyContext importado de mcp/auth/api-key-context.ts (antecipado do Bloco D Task D1).

import type { ApiKeyContext, Capabilities } from "../../auth/api-key-context.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import { mockPrisma } from "../mocks/prisma";

export const baseApiKeyContext: ApiKeyContext = {
  apiKeyId: "test-key-1",
  label: "test",
  last4: "AbCd",
  capabilities: { version: 1, read: [], write: {} },
  capabilitiesVersion: 1,
  rateLimit: 60,
  tenantId: null,
  allowedOrigins: [],
  isSystemKey: false,
};

export function createApiKeyCtx(
  overrides: {
    read?: string[];
    write?: Record<string, string[]>;
    capabilitiesVersion?: number;
    tenantId?: string | null;
    isSystemKey?: boolean;
  } = {},
): ApiKeyContext {
  return {
    ...baseApiKeyContext,
    capabilities: {
      version: 1,
      read: overrides.read ?? [],
      write: overrides.write ?? {},
    } satisfies Capabilities,
    capabilitiesVersion: overrides.capabilitiesVersion ?? 1,
    tenantId: overrides.tenantId ?? baseApiKeyContext.tenantId,
    isSystemKey: overrides.isSystemKey ?? baseApiKeyContext.isSystemKey,
  };
}

export function createMockContext(
  overrides: Partial<ToolHandlerCtx> = {},
): ToolHandlerCtx {
  return {
    prisma: mockPrisma() as any,
    user: { userId: "test-user", role: "super_admin", domains: [] } as any,
    ...overrides,
  };
}