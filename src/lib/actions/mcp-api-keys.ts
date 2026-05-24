"use server";

/**
 * Server Actions para gerenciamento de chaves de acesso do servidor MCP.
 *
 * Gate: super_admin em todas as operações (via requireSuperAdmin).
 * Token gerado: mcp_live_<32 bytes base64url>
 * keyHash = sha256hex(token), last4 = token.slice(-4)
 * O token em claro é devolvido UMA vez na criação , jamais persiste.
 *
 * Spec §15 (Painel MCP) + §5.3 (capabilities).
 */

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sha256hex } from "@/lib/crypto";
import { requireSuperAdmin } from "@/lib/actions/_helpers";
import { logAudit } from "@/lib/audit";
import { redis } from "@/lib/redis";
import type {
  McpCapabilities,
  McpApiKeyListItem,
  CreatedMcpApiKey,
  McpModule,
} from "@/lib/actions/mcp-api-keys-types";
import { SENSITIVE_ACTIONS } from "@/lib/actions/mcp-api-keys-types";

// ──────────────────────────────────────────────────────────────────────────────
// Types (internal)
// ──────────────────────────────────────────────────────────────────────────────

type DataResult<T> = { success: true; data: T } | { success: false; error: string };

// ──────────────────────────────────────────────────────────────────────────────
// Zod schemas
// ──────────────────────────────────────────────────────────────────────────────

const capabilitiesSchema = z.object({
  version: z.literal(1),
  read: z.array(z.string()),
  write: z.record(z.string(), z.array(z.string())),
});

const createSchema = z.object({
  label: z.string().min(1, "Label obrigatório").max(100),
  description: z.string().max(500).optional(),
  tenantId: z.string().uuid().optional().nullable(),
  capabilities: capabilitiesSchema,
  rateLimit: z.number().int().min(1).max(600).default(60),
  expiresAt: z.string().datetime().optional().nullable(),
  allowedOrigins: z.array(z.string().url()).default([]),
});

const updateSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  capabilities: capabilitiesSchema.optional(),
  rateLimit: z.number().int().min(1).max(600).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  allowedOrigins: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function generateMcpToken(): string {
  const bytes = randomBytes(32);
  const b64url = bytes.toString("base64url");
  return `mcp_live_${b64url}`;
}

function mapRow(row: {
  id: string;
  label: string;
  description: string | null;
  last4: string;
  capabilities: unknown;
  rateLimit: number;
  active: boolean;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  rotatedAt: Date | null;
  isSystemKey: boolean;
  tenantId: string | null;
  allowedOrigins: unknown;
  createdAt: Date;
}): McpApiKeyListItem {
  const rawCap = row.capabilities as Record<string, unknown> | null;
  const capabilities: McpCapabilities =
    rawCap && typeof rawCap === "object" && rawCap.version === 1
      ? (rawCap as unknown as McpCapabilities)
      : { version: 1, read: [], write: {} };

  const origins = Array.isArray(row.allowedOrigins)
    ? (row.allowedOrigins as string[])
    : [];

  return {
    id: row.id,
    label: row.label,
    description: row.description,
    last4: row.last4,
    capabilities,
    rateLimit: row.rateLimit,
    active: row.active,
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
    rotatedAt: row.rotatedAt,
    isSystemKey: row.isSystemKey,
    tenantId: row.tenantId,
    allowedOrigins: origins,
    createdAt: row.createdAt,
  };
}

async function publishKeyInvalidated(keyId: string): Promise<void> {
  try {
    await redis.publish(`mcp:keys:invalidated:${keyId}`, JSON.stringify({ keyId, ts: Date.now() }));
  } catch (err) {
    // Não-fatal: hot reload é best-effort
    console.warn("[mcp-api-keys] redis publish falhou:", err);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// listMcpApiKeys
// ──────────────────────────────────────────────────────────────────────────────

export async function listMcpApiKeys(): Promise<DataResult<McpApiKeyListItem[]>> {
  try {
    await requireSuperAdmin();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  try {
    const rows = await prisma.apiKey.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        label: true,
        description: true,
        last4: true,
        capabilities: true,
        rateLimit: true,
        active: true,
        expiresAt: true,
        lastUsedAt: true,
        revokedAt: true,
        rotatedAt: true,
        isSystemKey: true,
        tenantId: true,
        allowedOrigins: true,
        createdAt: true,
      },
    });

    return { success: true, data: rows.map(mapRow) };
  } catch (err) {
    console.error("[mcp-api-keys] listMcpApiKeys error:", err);
    return { success: false, error: "Erro ao listar chaves MCP" };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// createMcpApiKey (L2)
// ──────────────────────────────────────────────────────────────────────────────

export async function createMcpApiKey(input: {
  label: string;
  description?: string;
  tenantId?: string | null;
  capabilities: McpCapabilities;
  rateLimit?: number;
  expiresAt?: string | null;
  allowedOrigins?: string[];
}): Promise<DataResult<CreatedMcpApiKey>> {
  let me: { id: string };
  try {
    me = await requireSuperAdmin();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const token = generateMcpToken();
  const keyHash = sha256hex(token);
  const last4 = token.slice(-4);

  try {
    const created = await prisma.apiKey.create({
      data: {
        label: parsed.data.label,
        description: parsed.data.description ?? null,
        keyHash,
        last4,
        scopes: [],
        capabilities: parsed.data.capabilities as object,
        rateLimit: parsed.data.rateLimit,
        tenantId: parsed.data.tenantId ?? null,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
        allowedOrigins: parsed.data.allowedOrigins,
        createdById: me.id,
        active: true,
      },
    });

    await logAudit({
      userId: me.id,
      action: "api_key_created",
      targetType: "ApiKey",
      targetId: created.id,
      details: { label: parsed.data.label, capabilities: parsed.data.capabilities },
    });

    revalidatePath("/integracoes/servidor-mcp");

    return {
      success: true,
      data: { id: created.id, label: created.label, token, last4 },
    };
  } catch (err) {
    console.error("[mcp-api-keys] createMcpApiKey error:", err);
    return { success: false, error: "Erro ao criar chave MCP" };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// updateMcpApiKey (L5.1)
// ──────────────────────────────────────────────────────────────────────────────

export async function updateMcpApiKey(
  id: string,
  input: {
    label?: string;
    description?: string | null;
    capabilities?: McpCapabilities;
    rateLimit?: number;
    expiresAt?: string | null;
    allowedOrigins?: string[];
    active?: boolean;
  },
): Promise<DataResult<void>> {
  let me: { id: string };
  try {
    me = await requireSuperAdmin();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    const updateData: Record<string, unknown> = {};
    if (parsed.data.label !== undefined) updateData.label = parsed.data.label;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.capabilities !== undefined) updateData.capabilities = parsed.data.capabilities;
    if (parsed.data.rateLimit !== undefined) updateData.rateLimit = parsed.data.rateLimit;
    if (parsed.data.allowedOrigins !== undefined) updateData.allowedOrigins = parsed.data.allowedOrigins;
    if (parsed.data.active !== undefined) updateData.active = parsed.data.active;
    if ("expiresAt" in parsed.data) {
      updateData.expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
    }

    await prisma.apiKey.update({ where: { id }, data: updateData });

    await publishKeyInvalidated(id);

    // Nota: AuditAction não tem api_key_updated ainda , usa setting_updated como proxy
    await logAudit({
      userId: me.id,
      action: "setting_updated",
      targetType: "ApiKey",
      targetId: id,
      details: { ...(updateData as Record<string, unknown>), _event: "mcp_api_key_updated" },
    });

    revalidatePath("/integracoes/servidor-mcp");
    return { success: true, data: undefined };
  } catch (err) {
    console.error("[mcp-api-keys] updateMcpApiKey error:", err);
    return { success: false, error: "Erro ao atualizar chave MCP" };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// rotateMcpApiKey (L5.2) , gera novo token com grace period de 24h
// ──────────────────────────────────────────────────────────────────────────────

export async function rotateMcpApiKey(id: string): Promise<DataResult<CreatedMcpApiKey>> {
  let me: { id: string };
  try {
    me = await requireSuperAdmin();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const token = generateMcpToken();
  const keyHash = sha256hex(token);
  const last4 = token.slice(-4);

  try {
    const updated = await prisma.apiKey.update({
      where: { id },
      data: {
        keyHash,
        last4,
        rotatedAt: new Date(),
        // Grace period de 24h: active permanece true, o MCP aceita por mais 24h
        // via rotatedAt (implementado no middleware MCP).
      },
    });

    await publishKeyInvalidated(id);

    // Nota: AuditAction não tem api_key_rotated ainda , usa setting_updated como proxy
    await logAudit({
      userId: me.id,
      action: "setting_updated",
      targetType: "ApiKey",
      targetId: id,
      details: { _event: "mcp_api_key_rotated" },
    });

    revalidatePath("/integracoes/servidor-mcp");

    return { success: true, data: { id, label: updated.label, token, last4 } };
  } catch (err) {
    console.error("[mcp-api-keys] rotateMcpApiKey error:", err);
    return { success: false, error: "Erro ao rotacionar chave MCP" };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// revokeMcpApiKey (L5.3)
// ──────────────────────────────────────────────────────────────────────────────

export async function revokeMcpApiKey(
  id: string,
  reason?: string,
): Promise<DataResult<void>> {
  let me: { id: string };
  try {
    me = await requireSuperAdmin();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  try {
    await prisma.apiKey.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        revokedReason: reason ?? null,
        active: false,
      },
    });

    await publishKeyInvalidated(id);

    await logAudit({
      userId: me.id,
      action: "api_key_revoked",
      targetType: "ApiKey",
      targetId: id,
      details: reason ? { reason } : {},
    });

    revalidatePath("/integracoes/servidor-mcp");
    return { success: true, data: undefined };
  } catch (err) {
    console.error("[mcp-api-keys] revokeMcpApiKey error:", err);
    return { success: false, error: "Erro ao revogar chave MCP" };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// markLostAndRegenerate (L5.4)
// ──────────────────────────────────────────────────────────────────────────────

export async function markLostAndRegenerate(id: string): Promise<DataResult<CreatedMcpApiKey>> {
  // Revoga a chave atual e cria uma substituta com as mesmas capabilities.
  let me: { id: string };
  try {
    me = await requireSuperAdmin();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  try {
    const existing = await prisma.apiKey.findUniqueOrThrow({ where: { id } });

    // 1. Revogar a chave perdida
    await prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date(), revokedReason: "perdida", active: false },
    });
    await publishKeyInvalidated(id);

    // 2. Gerar substituta
    const token = generateMcpToken();
    const keyHash = sha256hex(token);
    const last4 = token.slice(-4);

    const created = await prisma.apiKey.create({
      data: {
        label: `${existing.label} (substituta)`,
        description: existing.description,
        keyHash,
        last4,
        scopes: [],
        capabilities: (existing.capabilities ?? { version: 1, read: [], write: {} }) as object,
        rateLimit: existing.rateLimit,
        tenantId: existing.tenantId ?? null,
        expiresAt: existing.expiresAt ?? null,
        allowedOrigins: (existing.allowedOrigins ?? []) as string[],
        createdById: me.id,
        active: true,
      },
    });

    await logAudit({
      userId: me.id,
      action: "api_key_created",
      targetType: "ApiKey",
      targetId: created.id,
      details: { label: created.label, replacedId: id, reason: "markLostAndRegenerate" },
    });

    revalidatePath("/integracoes/servidor-mcp");

    return { success: true, data: { id: created.id, label: created.label, token, last4 } };
  } catch (err) {
    console.error("[mcp-api-keys] markLostAndRegenerate error:", err);
    return { success: false, error: "Erro ao regenerar chave MCP" };
  }
}
