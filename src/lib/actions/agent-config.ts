"use server";

/**
 * Server Actions de configuração do agente nexus-odoo.
 *
 * - getAgentSettings(): lê o singleton AgentSettings id="global".
 * - updateAgentSettings(): persiste comportamento/tom/guardrails + audita.
 * - updateAgentResources(): checkpoints de áudio/imagem/KB + modelos dedicados.
 * - updateBubbleEnabled(): liga/desliga a bolha flutuante do Agente Nex.
 * - activateLlmConfig(id): desativa todas as configs + ativa a escolhida.
 *
 * Gate: super_admin e admin (manager/viewer → acesso negado).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "@/lib/actions/users";
import {
  CHECKPOINT_VALUES,
  type AgentSettingsData,
  type FeatureCheckpoint,
  type PublicAgentFlags,
} from "./agent-config-types";
import {
  DEFAULT_PERSONALITY,
  DEFAULT_TONE,
  DEFAULT_GUARDRAILS,
} from "@/lib/agent/prompt/defaults";
import { IDENTITY_BASE } from "@/lib/agent/prompt/identity-base";
import { sanitizePromptText } from "@/lib/agent/prompt/sanitize";

export type {
  AgentSettingsData,
  FeatureCheckpoint,
  PublicAgentFlags,
} from "./agent-config-types";

const CheckpointSchema = z.enum(CHECKPOINT_VALUES);

// Sanitiza no schema (defesa de borda): travessao, en-dash, reticencias
// unicode, aspas francesas e non-breaking spaces sao normalizados antes da
// persistencia. Acentos e cedilha preservados. Aplicado em todos os campos
// de prompt editaveis pelo admin para nao deixar `,` entrar de novo via UI.
const sanitizedString = (max: number, msg?: string) =>
  z.string().max(max, msg).transform((s) => sanitizePromptText(s));

const UpdateSettingsSchema = z.object({
  identityBase: sanitizedString(500_000).optional(),
  personality: sanitizedString(1000, "Comportamento não pode exceder 1000 caracteres"),
  tone: sanitizedString(1000, "Tom não pode exceder 1000 caracteres"),
  guardrails: z.array(
    sanitizedString(500, "Cada guardrail não pode exceder 500 caracteres"),
  ),
  terminology: z
    .record(z.string(), z.string())
    .transform((map) =>
      Object.fromEntries(
        Object.entries(map).map(([k, v]) => [
          sanitizePromptText(k),
          sanitizePromptText(v),
        ]),
      ),
    ),
  advancedOverride: sanitizedString(500_000).optional(),
  suggestionsEnabled: z.boolean(),
});

export type UpdateAgentSettingsInput = z.infer<typeof UpdateSettingsSchema>;

const UpdateResourcesSchema = z.object({
  audioCheckpoint: CheckpointSchema,
  imageCheckpoint: CheckpointSchema,
  kbCheckpoint: CheckpointSchema,
  /** G7 , checkpoint das sugestões (substitui o boolean suggestionsEnabled). */
  suggestionsCheckpoint: CheckpointSchema.optional(),
  audioProvider: z.string().nullable().optional(),
  audioModel: z.string().nullable().optional(),
  /** G6 , chave de API usada pelo modelo dedicado de áudio. */
  audioCredentialId: z.string().nullable().optional(),
  imageProvider: z.string().nullable().optional(),
  imageModel: z.string().nullable().optional(),
  /** G6 , chave de API usada pelo modelo dedicado de imagem. */
  imageCredentialId: z.string().nullable().optional(),
  /** Profundidade de raciocínio (modelos reasoning). null = default do provider. */
  reasoningEffort: z
    .enum(["minimal", "low", "medium", "high"])
    .nullable()
    .optional(),
  /** Checkpoint de 3 estados do modo raciocínio (OFF/PLAYGROUND/PRODUCTION). */
  reasoningCheckpoint: z.enum(CHECKPOINT_VALUES).optional(),
  /** Máximo de sugestões clicáveis (1..5). */
  maxSuggestions: z.number().int().min(1).max(5).optional(),
});
export type UpdateAgentResourcesInput = z.infer<typeof UpdateResourcesSchema>;

/** Verifica se o usuário tem permissão (admin ou super_admin). */
async function requireAdminOrAbove(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Não autenticado" };
  if (me.platformRole !== "admin" && me.platformRole !== "super_admin") {
    return { ok: false, error: "Acesso negado , requer perfil admin ou super_admin" };
  }
  return { ok: true, userId: me.id };
}

/** Linha bruta do AgentSettings vinda do Prisma. */
type AgentSettingsRow = {
  id: string;
  identityBase: string | null;
  personality: string;
  tone: string;
  guardrails: unknown;
  terminology: unknown;
  advancedOverride: string | null;
  suggestionsEnabled: boolean;
  suggestionsCheckpoint: FeatureCheckpoint;
  bubbleEnabled: boolean;
  whatsappEnabled: boolean;
  audioCheckpoint: FeatureCheckpoint;
  imageCheckpoint: FeatureCheckpoint;
  kbCheckpoint: FeatureCheckpoint;
  audioProvider: string | null;
  audioModel: string | null;
  audioCredentialId: string | null;
  imageProvider: string | null;
  imageModel: string | null;
  imageCredentialId: string | null;
  reasoningEffort: string | null;
  reasoningCheckpoint: FeatureCheckpoint;
  maxSuggestions: number;
  updatedAt: Date;
};

/** Converte a linha Prisma no DTO público. */
function mapSettings(row: AgentSettingsRow): AgentSettingsData {
  return {
    id: row.id,
    identityBase: row.identityBase,
    personality: row.personality,
    tone: row.tone,
    guardrails: (row.guardrails as string[]) ?? [],
    terminology: (row.terminology as Record<string, string>) ?? {},
    advancedOverride: row.advancedOverride,
    suggestionsEnabled: row.suggestionsEnabled,
    suggestionsCheckpoint: row.suggestionsCheckpoint,
    bubbleEnabled: row.bubbleEnabled,
    whatsappEnabled: row.whatsappEnabled,
    audioCheckpoint: row.audioCheckpoint,
    imageCheckpoint: row.imageCheckpoint,
    kbCheckpoint: row.kbCheckpoint,
    audioProvider: row.audioProvider,
    audioModel: row.audioModel,
    audioCredentialId: row.audioCredentialId,
    imageProvider: row.imageProvider,
    imageModel: row.imageModel,
    imageCredentialId: row.imageCredentialId,
    reasoningEffort: row.reasoningEffort,
    reasoningCheckpoint: row.reasoningCheckpoint,
    maxSuggestions: row.maxSuggestions,
    updatedAt: row.updatedAt,
  };
}

/**
 * Garante que o singleton existe e está preenchido.
 *
 * Cria com os defaults do domínio Matrix Fitness Group quando ausente. Para
 * instalações antigas em que o singleton foi criado vazio (personality/tone/
 * guardrails em branco, identityBase nulo), faz um auto-reparo preenchendo
 * APENAS os campos ainda vazios , edições feitas pelo admin nunca são tocadas.
 */
async function ensureGlobalSettings(): Promise<AgentSettingsData> {
  const existing = await prisma.agentSettings.findUnique({
    where: { id: "global" },
  });
  if (existing) {
    const repair: {
      identityBase?: string;
      personality?: string;
      tone?: string;
      guardrails?: string[];
    } = {};
    if (!existing.identityBase) repair.identityBase = IDENTITY_BASE;
    if (!existing.personality.trim()) repair.personality = DEFAULT_PERSONALITY;
    if (!existing.tone.trim()) repair.tone = DEFAULT_TONE;
    const currentGuardrails = existing.guardrails as unknown;
    if (!Array.isArray(currentGuardrails) || currentGuardrails.length === 0) {
      repair.guardrails = DEFAULT_GUARDRAILS;
    }
    if (Object.keys(repair).length > 0) {
      const fixed = await prisma.agentSettings.update({
        where: { id: "global" },
        data: repair,
      });
      return mapSettings(fixed as AgentSettingsRow);
    }
    return mapSettings(existing as AgentSettingsRow);
  }

  const created = await prisma.agentSettings.upsert({
    where: { id: "global" },
    create: {
      id: "global",
      identityBase: IDENTITY_BASE,
      personality: DEFAULT_PERSONALITY,
      tone: DEFAULT_TONE,
      guardrails: DEFAULT_GUARDRAILS,
      terminology: {},
      suggestionsEnabled: true,
    },
    update: {},
  });
  return mapSettings(created as AgentSettingsRow);
}

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

const DEFAULT_FLAGS: PublicAgentFlags = {
  audioInputEnabled: false,
  audioInPlayground: false,
  imageInputEnabled: false,
  imageInPlayground: false,
  kbEnabled: true,
  kbInPlayground: true,
  suggestionsEnabled: true,
  suggestionsInPlayground: true,
  bubbleEnabled: true,
  whatsappEnabled: true,
  maxSuggestions: 3,
};

/** Feature-flags públicas do agente, legíveis por qualquer usuário autenticado. */
export async function getPublicAgentFlags(): Promise<PublicAgentFlags> {
  try {
    const me = await getCurrentUser();
    if (!me) return DEFAULT_FLAGS;

    const settings = await prisma.agentSettings.findUnique({
      where: { id: "global" },
      select: {
        audioCheckpoint: true,
        imageCheckpoint: true,
        kbCheckpoint: true,
        suggestionsCheckpoint: true,
        bubbleEnabled: true,
        whatsappEnabled: true,
        maxSuggestions: true,
      },
    });
    if (!settings) return DEFAULT_FLAGS;

    return {
      audioInputEnabled: settings.audioCheckpoint === "PRODUCTION",
      audioInPlayground: settings.audioCheckpoint !== "OFF",
      imageInputEnabled: settings.imageCheckpoint === "PRODUCTION",
      imageInPlayground: settings.imageCheckpoint !== "OFF",
      kbEnabled: settings.kbCheckpoint === "PRODUCTION",
      kbInPlayground: settings.kbCheckpoint !== "OFF",
      suggestionsEnabled: settings.suggestionsCheckpoint === "PRODUCTION",
      suggestionsInPlayground: settings.suggestionsCheckpoint !== "OFF",
      bubbleEnabled: settings.bubbleEnabled,
      whatsappEnabled: settings.whatsappEnabled,
      maxSuggestions: Math.min(Math.max(1, settings.maxSuggestions ?? 3), 5),
    };
  } catch (err) {
    console.error("[getPublicAgentFlags]", err);
    return DEFAULT_FLAGS;
  }
}

/** Atualiza comportamento, tom e guardrails do agente. */
export async function updateAgentSettings(
  input: UpdateAgentSettingsInput,
): Promise<ActionResult> {
  try {
    const auth = await requireAdminOrAbove();
    if (!auth.ok) return { success: false, error: auth.error };

    const parsed = UpdateSettingsSchema.safeParse(input);
    if (!parsed.success) {
      const issues =
        (parsed.error as { issues?: { message: string; path: (string | number)[] }[] })
          .issues ?? [];
      const first = issues[0];
      const message = first?.message ?? "Dados inválidos";
      const path = first?.path?.join(".") ?? "";
      return { success: false, error: path ? `${path}: ${message}` : message };
    }

    const data = parsed.data;
    const common = {
      personality: data.personality,
      tone: data.tone,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      guardrails: data.guardrails as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      terminology: data.terminology as any,
      advancedOverride: data.advancedOverride ?? null,
      suggestionsEnabled: data.suggestionsEnabled,
      ...(data.identityBase !== undefined ? { identityBase: data.identityBase } : {}),
    };

    await prisma.agentSettings.upsert({
      where: { id: "global" },
      create: { id: "global", ...common },
      update: common,
    });

    void logAudit({
      userId: auth.userId,
      action: "agent_settings_updated",
      targetType: "AgentSettings",
      targetId: "global",
    });

    revalidatePath("/agente");
    revalidatePath("/agente/prompt");
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
 * Atualiza os recursos do agente: checkpoints de áudio/imagem/KB e os
 * modelos dedicados de áudio e imagem.
 */
export async function updateAgentResources(
  input: UpdateAgentResourcesInput,
): Promise<ActionResult> {
  try {
    const auth = await requireAdminOrAbove();
    if (!auth.ok) return { success: false, error: auth.error };

    const parsed = UpdateResourcesSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Dados de recursos inválidos" };
    }
    const d = parsed.data;

    const payload: Record<string, unknown> = {
      audioCheckpoint: d.audioCheckpoint,
      imageCheckpoint: d.imageCheckpoint,
      kbCheckpoint: d.kbCheckpoint,
      audioProvider: d.audioProvider ?? null,
      audioModel: d.audioModel ?? null,
      audioCredentialId: d.audioCredentialId ?? null,
      imageProvider: d.imageProvider ?? null,
      imageModel: d.imageModel ?? null,
      imageCredentialId: d.imageCredentialId ?? null,
    };
    if (d.suggestionsCheckpoint) {
      payload.suggestionsCheckpoint = d.suggestionsCheckpoint;
      // Mantém o boolean legado em sincronia (compat com leitores antigos).
      payload.suggestionsEnabled = d.suggestionsCheckpoint === "PRODUCTION";
    }
    if (d.reasoningEffort !== undefined) {
      payload.reasoningEffort = d.reasoningEffort;
    }
    if (d.maxSuggestions !== undefined) {
      payload.maxSuggestions = d.maxSuggestions;
    }
    if (d.reasoningCheckpoint) {
      payload.reasoningCheckpoint = d.reasoningCheckpoint;
    }

    await prisma.agentSettings.upsert({
      where: { id: "global" },
      create: {
        id: "global",
        personality: "",
        tone: "",
        guardrails: [],
        terminology: {},
        ...payload,
      },
      update: payload,
    });

    void logAudit({
      userId: auth.userId,
      action: "agent_settings_updated",
      targetType: "AgentSettings",
      targetId: "global",
      details: { kind: "resources" },
    });

    revalidatePath("/agente");
    revalidatePath("/agente/prompt");

    return { success: true };
  } catch (err) {
    console.error("[updateAgentResources]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao atualizar recursos",
    };
  }
}

/**
 * Atualiza a disponibilidade do Agente Nex em cada canal (bubble in-app e
 * WhatsApp). Persistido como dois booleans independentes; a UI lê e mostra
 * um sumario de 4 estados (off, so bubble, so whatsapp, ambos).
 */
export async function updateAgentAvailability(input: {
  bubbleEnabled: boolean;
  whatsappEnabled: boolean;
}): Promise<ActionResult> {
  try {
    const auth = await requireAdminOrAbove();
    if (!auth.ok) return { success: false, error: auth.error };

    await prisma.agentSettings.upsert({
      where: { id: "global" },
      create: {
        id: "global",
        personality: "",
        tone: "",
        guardrails: [],
        terminology: {},
        bubbleEnabled: input.bubbleEnabled,
        whatsappEnabled: input.whatsappEnabled,
      },
      update: {
        bubbleEnabled: input.bubbleEnabled,
        whatsappEnabled: input.whatsappEnabled,
      },
    });

    void logAudit({
      userId: auth.userId,
      action: "agent_settings_updated",
      targetType: "AgentSettings",
      targetId: "global",
      details: {
        kind: "availability",
        bubbleEnabled: input.bubbleEnabled,
        whatsappEnabled: input.whatsappEnabled,
      },
    });

    revalidatePath("/agente");
    revalidatePath("/agente/configuracao");
    return { success: true };
  } catch (err) {
    console.error("[updateAgentAvailability]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao atualizar disponibilidade",
    };
  }
}

/** Liga/desliga a exibição da bolha flutuante do Agente Nex. */
export async function updateBubbleEnabled(enabled: boolean): Promise<ActionResult> {
  try {
    const auth = await requireAdminOrAbove();
    if (!auth.ok) return { success: false, error: auth.error };

    await prisma.agentSettings.upsert({
      where: { id: "global" },
      create: {
        id: "global",
        personality: "",
        tone: "",
        guardrails: [],
        terminology: {},
        bubbleEnabled: enabled,
      },
      update: { bubbleEnabled: enabled },
    });

    void logAudit({
      userId: auth.userId,
      action: "agent_settings_updated",
      targetType: "AgentSettings",
      targetId: "global",
      details: { kind: "bubble", enabled },
    });

    revalidatePath("/agente");
    revalidatePath("/agente/configuracao");
    return { success: true };
  } catch (err) {
    console.error("[updateBubbleEnabled]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao atualizar bolha",
    };
  }
}

/**
 * Ativa uma LlmConfig pelo id.
 * Transacional: desativa todas + ativa a escolhida.
 */
export async function activateLlmConfig(configId: string): Promise<ActionResult> {
  try {
    const auth = await requireAdminOrAbove();
    if (!auth.ok) return { success: false, error: auth.error };

    const config = await prisma.llmConfig.findFirst({
      where: { id: configId },
      select: { id: true, provider: true },
    });
    if (!config) {
      return { success: false, error: `Config ${configId} não encontrada` };
    }

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

/** Cria uma nova LlmConfig (inativa por padrão). */
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
