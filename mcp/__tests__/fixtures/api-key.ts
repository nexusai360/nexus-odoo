// mcp/__tests__/fixtures/api-key.ts
// Fixture de ApiKey real via Prisma para testes E2E.
// Cria uma ApiKey no banco local, retornando o token em claro (gerado aqui
// e hashado antes de persistir) para uso nas asserções.
//
// Uso:
//   const { id, token, apiKey } = await createTestApiKey({ capabilities: {...} });
//   // ... use token nas requests
//   await cleanupTestApiKey(id);

import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { PrismaClient } from "@/generated/prisma/client";
import type { Capabilities } from "../../auth/api-key-context.js";
import { TEST_PREFIX } from "../e2e/setup.js";

/** Token gerado: 32 bytes hex = 64 chars. Mesmo formato do app real. */
function generateToken(): string {
  return randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface TestApiKeyOptions {
  label?: string;
  capabilities?: Partial<Capabilities>;
  rateLimit?: number;
  tenantId?: string | null;
  isSystemKey?: boolean;
  active?: boolean;
  expiresAt?: Date | null;
}

export interface TestApiKeyResult {
  id: string;
  token: string;
  last4: string;
  apiKey: {
    id: string;
    label: string;
    last4: string;
    capabilities: Capabilities;
    capabilitiesVersion: number;
    rateLimit: number;
    tenantId: string | null;
    allowedOrigins: string[];
    isSystemKey: boolean;
  };
}

/**
 * Cria uma ApiKey real no banco local de teste.
 * O token é gerado aqui, hashado com SHA-256 antes de persistir.
 * Retorna o token em claro para uso em requests de teste.
 *
 * IMPORTANTE: chamar cleanupTestApiKey(id) em afterAll/afterEach.
 */
export async function createTestApiKey(
  prisma: PrismaClient,
  opts: TestApiKeyOptions = {},
): Promise<TestApiKeyResult> {
  const token = generateToken();
  const keyHash = hashToken(token);
  const last4 = token.slice(-4);

  const capabilities: Capabilities = {
    version: 1,
    read: opts.capabilities?.read ?? [],
    write: opts.capabilities?.write ?? {},
  };

  const row = await prisma.apiKey.create({
    data: {
      label: opts.label ?? `${TEST_PREFIX} e2e-test-key`,
      keyHash,
      last4,
      capabilities: capabilities as object,
      capabilitiesVersion: 1,
      rateLimit: opts.rateLimit ?? 120,
      tenantId: opts.tenantId ?? null,
      isSystemKey: opts.isSystemKey ?? false,
      active: opts.active ?? true,
      expiresAt: opts.expiresAt ?? null,
      allowedOrigins: [],
    },
  });

  return {
    id: row.id,
    token,
    last4,
    apiKey: {
      id: row.id,
      label: row.label,
      last4: row.last4,
      capabilities,
      capabilitiesVersion: row.capabilitiesVersion,
      rateLimit: row.rateLimit,
      tenantId: row.tenantId,
      allowedOrigins: [],
      isSystemKey: row.isSystemKey,
    },
  };
}

/**
 * Remove uma ApiKey criada em teste.
 * Silencia NotFoundError , idempotente para uso em afterAll.
 */
export async function cleanupTestApiKey(
  prisma: PrismaClient,
  id: string,
): Promise<void> {
  try {
    await prisma.apiKey.delete({ where: { id } });
  } catch {
    // Ignorar , já removida ou nunca criada
  }
}
