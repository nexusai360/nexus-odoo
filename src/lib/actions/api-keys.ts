"use server";

/**
 * Server Actions para gerenciamento de API keys da plataforma.
 *
 * Gate: apenas `super_admin` pode criar, listar ou revogar.
 * Hash SHA-256: a key em claro é exibida 1× na criação e jamais persiste.
 * Apenas `keyHash` e `last4` são gravados no banco.
 * Auditoria em toda criação e revogação.
 *
 * SPEC §7.4.1 e §9.2.
 */

import { createHash, randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

type DataResult<T> = { success: true; data: T } | { success: false; error: string };

export interface ApiKeyListItem {
  id: string;
  label: string;
  last4: string;
  scopes: string[];
  revokedAt: Date | null;
  createdAt: Date;
}

export interface CreatedApiKey {
  id: string;
  label: string;
  key: string; // em claro , exibir 1×, não persistir
  last4: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Gera uma API key com prefixo `nxo_` + 32 bytes aleatórios em hex. */
function generateApiKey(): string {
  return `nxo_${randomBytes(32).toString("hex")}`;
}

function isSuperAdmin(role: string): boolean {
  return role === "super_admin";
}

// ──────────────────────────────────────────────────────────────────────────────
// Schemas
// ──────────────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  label: z.string().min(1, "Label obrigatório"),
  scopes: z.array(z.string()),
});

// ──────────────────────────────────────────────────────────────────────────────
// createApiKey
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Cria uma nova API key.
 * Retorna a key em claro uma única vez (após isso, inacessível).
 * Gate: super_admin.
 */
export async function createApiKey(
  label: string,
  scopes: string[],
): Promise<DataResult<CreatedApiKey>> {
  const me = await getCurrentUser();
  if (!me) return { success: false, error: "Não autenticado" };
  if (!isSuperAdmin(me.platformRole)) return { success: false, error: "Acesso negado" };

  const parsed = createSchema.safeParse({ label, scopes });
  if (!parsed.success) {
    return { success: false, error: "Dados inválidos" };
  }

  const key = generateApiKey();
  const keyHash = sha256(key);
  const last4 = key.slice(-4);

  try {
    const created = await prisma.apiKey.create({
      data: {
        label: parsed.data.label,
        keyHash,
        last4,
        scopes: parsed.data.scopes,
        createdById: me.id,
      },
    });

    await logAudit({
      userId: me.id,
      action: "api_key_created",
      targetType: "ApiKey",
      targetId: created.id,
      details: { label: parsed.data.label, scopes: parsed.data.scopes },
    });

    revalidatePath("/integracoes/api");

    return {
      success: true,
      data: {
        id: created.id,
        label: created.label,
        key, // em claro , exibir 1×
        last4,
      },
    };
  } catch (err) {
    console.error("[api-keys] createApiKey error:", err);
    return { success: false, error: "Erro ao criar API key" };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// listApiKeys
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Lista todas as API keys (incluindo revogadas).
 * Gate: super_admin.
 */
export async function listApiKeys(): Promise<DataResult<ApiKeyListItem[]>> {
  const me = await getCurrentUser();
  if (!me) return { success: false, error: "Não autenticado" };
  if (!isSuperAdmin(me.platformRole)) return { success: false, error: "Acesso negado" };

  try {
    const rows = await prisma.apiKey.findMany({
      orderBy: { createdAt: "desc" },
    });

    const data: ApiKeyListItem[] = rows.map((r) => ({
      id: r.id,
      label: r.label,
      last4: r.last4,
      scopes: Array.isArray(r.scopes) ? (r.scopes as string[]) : [],
      revokedAt: r.revokedAt,
      createdAt: r.createdAt,
    }));

    return { success: true, data };
  } catch (err) {
    console.error("[api-keys] listApiKeys error:", err);
    return { success: false, error: "Erro ao listar API keys" };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// revokeApiKey
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Revoga uma API key pelo ID.
 * Gate: super_admin.
 */
export async function revokeApiKey(id: string): Promise<DataResult<void>> {
  const me = await getCurrentUser();
  if (!me) return { success: false, error: "Não autenticado" };
  if (!isSuperAdmin(me.platformRole)) return { success: false, error: "Acesso negado" };

  try {
    await prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    await logAudit({
      userId: me.id,
      action: "api_key_revoked",
      targetType: "ApiKey",
      targetId: id,
    });

    revalidatePath("/integracoes/api");

    return { success: true, data: undefined };
  } catch (err) {
    console.error("[api-keys] revokeApiKey error:", err);
    return { success: false, error: "Erro ao revogar API key" };
  }
}
