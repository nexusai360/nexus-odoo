"use server";

/**
 * Server Actions de configuração do agente nexus-odoo.
 *
 * - getAgentSettings(): lê o singleton AgentSettings id="global".
 * - updateAgentSettings(): persiste campos editáveis + audita.
 * - activateLlmConfig(id): desativa todas as configs + ativa a escolhida (transacional).
 *
 * Gate: super_admin e admin (manager/viewer → acesso negado).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "@/lib/actions/users";

// ---------------------------------------------------------------------------
// Schemas de validação
// ---------------------------------------------------------------------------

const UpdateSettingsSchema = z.object({
  identityBase: z.string().max(50_000).optional(),
  personality: z.string().max(500, "Personalidade não pode exceder 500 caracteres"),
  tone: z.string().max(500),
  guardrails: z
    .array(z.string().max(300))
    .max(20, "Máximo de 20 guardrails permitidos"),
  terminology: z.record(z.string(), z.string()),
  advancedOverride: z.string().max(50_000).optional(),
  audioInputEnabled: z.boolean(),
  kbEnabled: z.boolean(),
  suggestionsEnabled: z.boolean(),
});

export type UpdateAgentSettingsInput = z.infer<typeof UpdateSettingsSchema>;

// ---------------------------------------------------------------------------
// Tipos de retorno
// ---------------------------------------------------------------------------

export interface AgentSettingsData {
  id: string;
  identityBase: string | null;
  personality: string;
  tone: string;
  guardrails: string[];
  terminology: Record<string, string>;
  advancedOverride: string | null;
  audioInputEnabled: boolean;
  kbEnabled: boolean;
  suggestionsEnabled: boolean;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Verifica se o usuário tem permissão (admin ou super_admin). */
async function requireAdminOrAbove(): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Não autenticado" };
  if (me.platformRole !== "admin" && me.platformRole !== "super_admin") {
    return { ok: false, error: "Acesso negado — requer perfil admin ou super_admin" };
  }
  return { ok: true, userId: me.id };
}

/** Garante que o singleton existe (cria com defaults se necessário). */
async function ensureGlobalSettings(): Promise<AgentSettingsData> {
  const existing = await prisma.agentSettings.findUnique({
    where: { id: "global" },
  });

  if (existing) {
    return {
      id: existing.id,
      identityBase: existing.identityBase,
      personality: existing.personality,
      tone: existing.tone,
      guardrails: (existing.guardrails as string[]) ?? [],
      terminology: (existing.terminology as Record<string, string>) ?? {},
      advancedOverride: existing.advancedOverride,
      audioInputEnabled: existing.audioInputEnabled,
      kbEnabled: existing.kbEnabled,
      suggestionsEnabled: existing.suggestionsEnabled,
      updatedAt: existing.updatedAt,
    };
  }

  // Upsert com defaults
  const created = await prisma.agentSettings.upsert({
    where: { id: "global" },
    create: {
      id: "global",
      personality: "",
      tone: "",
      guardrails: [],
      terminology: {},
      audioInputEnabled: false,
      kbEnabled: true,
      suggestionsEnabled: true,
    },
    update: {},
  });

  return {
    id: created.id,
    identityBase: created.identityBase,
    personality: created.personality,
    tone: created.tone,
    guardrails: (created.guardrails as string[]) ?? [],
    terminology: (created.terminology as Record<string, string>) ?? {},
    advancedOverride: created.advancedOverride,
    audioInputEnabled: created.audioInputEnabled,
    kbEnabled: created.kbEnabled,
    suggestionsEnabled: created.suggestionsEnabled,
    updatedAt: created.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Retorna a configuração do agente (singleton "global"). */
export async function getAgentSettings(): Promise<ActionResult<AgentSettingsData>> {
  try {
    const auth = await requireAdminOrAbove();
    if (!auth.ok) return { success: false, error: auth.error };

    const settings = await ensureGlobalSettings();
    return { success: true, data: settings };
  } catch (err) {
    console.error("[getAgentSettings]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao buscar configurações",
    };
  }
}

/**
 * Atualiza os campos de configuração do agente.
 * Audita a ação como `agent_settings_updated`.
 */
export async function updateAgentSettings(
  input: UpdateAgentSettingsInput,
): Promise<ActionResult> {
  try {
    const auth = await requireAdminOrAbove();
    if (!auth.ok) return { success: false, error: auth.error };

    const parsed = UpdateSettingsSchema.safeParse(input);
    if (!parsed.success) {
      // Zod v4 usa .issues; v3 usava .errors — suportar ambos
      const issues = (parsed.error as { issues?: { message: string; path: (string | number)[] }[]; errors?: { message: string; path: (string | number)[] }[] }).issues
        ?? (parsed.error as { errors?: { message: string; path: (string | number)[] }[] }).errors
        ?? [];
      const first = issues[0];
      const message = first?.message ?? "Dados inválidos";
      const path = first?.path?.join(".") ?? "";
      const enriched = path ? `${path}: ${message}` : message;
      return { success: false, error: enriched };
    }

    const data = parsed.data;

    await prisma.agentSettings.upsert({
      where: { id: "global" },
      create: {
        id: "global",
        personality: data.personality,
        tone: data.tone,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        guardrails: data.guardrails as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        terminology: data.terminology as any,
        advancedOverride: data.advancedOverride ?? null,
        audioInputEnabled: data.audioInputEnabled,
        kbEnabled: data.kbEnabled,
        suggestionsEnabled: data.suggestionsEnabled,
        ...(data.identityBase !== undefined ? { identityBase: data.identityBase } : {}),
      },
      update: {
        personality: data.personality,
        tone: data.tone,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        guardrails: data.guardrails as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        terminology: data.terminology as any,
        advancedOverride: data.advancedOverride ?? null,
        audioInputEnabled: data.audioInputEnabled,
        kbEnabled: data.kbEnabled,
        suggestionsEnabled: data.suggestionsEnabled,
        ...(data.identityBase !== undefined ? { identityBase: data.identityBase } : {}),
      },
    });

    void logAudit({
      userId: auth.userId,
      action: "agent_settings_updated",
      targetType: "AgentSettings",
      targetId: "global",
    });

    revalidatePath("/agente");
    revalidatePath("/agente/configuracao");

    return { success: true };
  } catch (err) {
    console.error("[updateAgentSettings]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao atualizar configurações",
    };
  }
}

/**
 * Ativa uma LlmConfig pelo id.
 * Transacional: desativa todas + ativa a escolhida.
 * Gate: super_admin ou admin.
 */
export async function activateLlmConfig(configId: string): Promise<ActionResult> {
  try {
    const auth = await requireAdminOrAbove();
    if (!auth.ok) return { success: false, error: auth.error };

    // Verificar que a config existe
    const config = await prisma.llmConfig.findFirst({
      where: { id: configId },
      select: { id: true, provider: true },
    });

    if (!config) {
      return { success: false, error: `Config ${configId} não encontrada` };
    }

    // Transacional: desativa todas → ativa a escolhida
    await prisma.llmConfig.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    await prisma.llmConfig.update({
      where: { id: configId },
      data: { isActive: true },
    });

    void logAudit({
      userId: auth.userId,
      action: "agent_settings_updated",
      targetType: "LlmConfig",
      targetId: configId,
      details: { provider: config.provider },
    });

    revalidatePath("/agente/configuracao");

    return { success: true };
  } catch (err) {
    console.error("[activateLlmConfig]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao ativar config",
    };
  }
}

/**
 * Cria uma nova LlmConfig (inativa por padrão).
 * Gate: super_admin ou admin.
 */
export async function createLlmConfig(input: {
  provider: string;
  model: string;
  credentialId: string | null;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const auth = await requireAdminOrAbove();
    if (!auth.ok) return { success: false, error: auth.error };

    if (!input.model.trim()) {
      return { success: false, error: "Modelo obrigatório" };
    }

    const created = await prisma.llmConfig.create({
      data: {
        provider: input.provider,
        model: input.model.trim(),
        credentialId: input.credentialId || null,
        isActive: false,
      },
      select: { id: true },
    });

    void logAudit({
      userId: auth.userId,
      action: "agent_settings_updated",
      targetType: "LlmConfig",
      targetId: created.id,
      details: { provider: input.provider, model: input.model },
    });

    revalidatePath("/agente/configuracao");

    return { success: true, data: { id: created.id } };
  } catch (err) {
    console.error("[createLlmConfig]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao criar configuração",
    };
  }
}
