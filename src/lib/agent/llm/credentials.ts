/**
 * CRUD de credenciais de API de LLM — chaves cifradas com AES-256.
 *
 * Portado de nexus-insights/src/lib/llm/credentials.ts. Adaptações:
 *  - Usa `src/lib/prisma.ts` e o model `LlmCredential` da migration F5.
 *  - Usa `src/lib/encryption.ts` (mesmo contrato encrypt/decrypt).
 *  - Grava `AuditLog` via `src/lib/audit.ts`.
 *  - Sem `ensureLlmTables()` — usamos migrations Prisma.
 */

import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";
import type { LlmProvider } from "./types";

export const CREDENTIAL_IN_USE = "CREDENTIAL_IN_USE";

const MAX_LABEL_LEN = 60;
const MIN_API_KEY_LEN = 10;

export interface CredentialSummary {
  id: string;
  provider: LlmProvider;
  label: string;
  last4: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCredentialInput {
  provider: LlmProvider;
  label?: string;
  apiKey: string;
}

function assertValidLabel(label: string): void {
  if (label.length === 0 || label.length > MAX_LABEL_LEN) {
    throw new Error(`Label inválida (1 a ${MAX_LABEL_LEN} caracteres)`);
  }
}

function assertValidApiKey(apiKey: string): void {
  if (typeof apiKey !== "string" || apiKey.trim().length < MIN_API_KEY_LEN) {
    throw new Error("API key inválida (muito curta)");
  }
}

async function isLabelTaken(
  provider: LlmProvider,
  label: string,
  excludeId?: string,
): Promise<boolean> {
  const existing = await prisma.llmCredential.findFirst({
    where: {
      provider,
      label,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  return existing !== null;
}

/** Lista todas as credenciais (chave mascarada — expõe só `last4`). */
export async function listCredentials(
  provider?: LlmProvider,
): Promise<CredentialSummary[]> {
  const rows = await prisma.llmCredential.findMany({
    where: provider ? { provider } : undefined,
    orderBy: [{ provider: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      provider: true,
      label: true,
      last4: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    provider: row.provider as LlmProvider,
    label: row.label,
    last4: row.last4,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/** Cria uma credencial — chave cifrada com AES-256. */
export async function createCredential(
  input: CreateCredentialInput,
  createdById?: string | null,
): Promise<{ id: string; label: string; last4: string }> {
  const trimmed = (input.apiKey ?? "").trim();
  assertValidApiKey(trimmed);

  // label explicitamente passada (inclusive "") → validar tal qual.
  // label omitida (undefined) → autogerar.
  let label: string;
  if (input.label !== undefined) {
    label = input.label.trim();
    assertValidLabel(label);
  } else {
    label = `Chave ${Date.now()}`;
  }

  if (await isLabelTaken(input.provider, label)) {
    throw new Error(`Label "${label}" já existe para este provider`);
  }

  const last4 = trimmed.slice(-4);
  const encryptedApiKey = encrypt(trimmed);

  const created = await prisma.llmCredential.create({
    data: {
      provider: input.provider,
      label,
      encryptedApiKey,
      last4,
      createdById: createdById ?? null,
    },
    select: { id: true, label: true, last4: true },
  });

  await logAudit({
    userId: createdById ?? undefined,
    action: "llm_credential_created",
    targetType: "llm_credential",
    targetId: created.id,
    details: { provider: input.provider, label },
  });

  return created;
}

/** Exclui uma credencial. Lança CREDENTIAL_IN_USE se estiver em uso por LlmConfig. */
export async function deleteCredential(
  id: string,
  deletedById?: string | null,
): Promise<void> {
  const inUse = await prisma.llmConfig.count({
    where: { credentialId: id },
  });

  if (inUse > 0) {
    throw new Error(CREDENTIAL_IN_USE);
  }

  await prisma.llmCredential.delete({ where: { id } });

  await logAudit({
    userId: deletedById ?? undefined,
    action: "llm_credential_deleted",
    targetType: "llm_credential",
    targetId: id,
  });
}

/** Retorna a chave decifrada, ou null se a credencial não existir. */
export async function getDecryptedKey(id: string): Promise<string | null> {
  const row = await prisma.llmCredential.findFirst({
    where: { id },
    select: { encryptedApiKey: true },
  });

  if (!row) return null;

  try {
    return decrypt(row.encryptedApiKey);
  } catch {
    return null;
  }
}
