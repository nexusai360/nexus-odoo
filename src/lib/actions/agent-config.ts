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
import type { ChannelAccessLevel } from "@/generated/prisma/client";
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
  /** B1 , checkpoint do feedback do usuário na bubble. */
  feedbackCheckpoint: CheckpointSchema.optional(),
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
    .enum(["auto", "minimal", "low", "medium", "high"])
    .nullable()
    .optional(),
  /** Checkpoint de 3 estados do modo raciocínio (OFF/PLAYGROUND/PRODUCTION). */
  reasoningCheckpoint: z.enum(CHECKPOINT_VALUES).optional(),
  /** Máximo de sugestões clicáveis (1..5). */
  maxSuggestions: z.number().int().min(1).max(5).optional(),
  /** R2-ctx: janela de contexto da resposta. */
  contextWindowCheckpoint: z.enum(CHECKPOINT_VALUES).optional(),
  /** Trava dura 10..50 na escrita. */
  contextWindowSize: z.number().int().min(10).max(50).optional(),
  contextWindowIncludeSystem: z.boolean().optional(),
});
export type UpdateAgentResourcesInput = z.infer<typeof UpdateResourcesSchema>;

/** R2-ctx: configuração do router (Construção da pergunta + modelo de embedding). */
const UpdateRouterConfigSchema = z.object({
  routerReformCheckpoint: z.enum(CHECKPOINT_VALUES),
  routerReformProvider: z.string().nullable().optional(),
  routerReformModel: z.string().nullable().optional(),
  routerReformCredentialId: z.string().nullable().optional(),
  routerReformNPairs: z.number().int().min(1).max(10).optional(),
  routerEmbeddingModel: z.string().nullable().optional(),
});
export type UpdateRouterConfigInput = z.infer<typeof UpdateRouterConfigSchema>;

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
  bubbleAccessLevel: ChannelAccessLevel;
  whatsappAccessLevel: ChannelAccessLevel;
  audioCheckpoint: FeatureCheckpoint;
  imageCheckpoint: FeatureCheckpoint;
  feedbackCheckpoint: FeatureCheckpoint;
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
  usesCodeDefaults: boolean;
  updatedAt: Date;
};

/**
 * Converte a linha Prisma no DTO público.
 *
 * IMPORTANTE: quando `usesCodeDefaults === true`, retorna identityBase /
 * personality / tone / guardrails do CÓDIGO em vez do banco. Isso resolve
 * o drift dev/banco , dev edita identity-base.ts e a mudança REFLETE
 * imediatamente sem precisar de UPDATE manual. Auto-flip pra false só
 * quando admin SALVA via UI `/agente/prompt`.
 */
function mapSettings(row: AgentSettingsRow): AgentSettingsData {
  const useCode = row.usesCodeDefaults;
  return {
    id: row.id,
    identityBase: useCode ? IDENTITY_BASE : row.identityBase,
    personality: useCode ? DEFAULT_PERSONALITY : row.personality,
    tone: useCode ? DEFAULT_TONE : row.tone,
    guardrails: useCode
      ? DEFAULT_GUARDRAILS
      : ((row.guardrails as string[]) ?? []),
    terminology: (row.terminology as Record<string, string>) ?? {},
    advancedOverride: row.advancedOverride,
    suggestionsEnabled: row.suggestionsEnabled,
    suggestionsCheckpoint: row.suggestionsCheckpoint,
    bubbleEnabled: row.bubbleEnabled,
    whatsappEnabled: row.whatsappEnabled,
    bubbleAccessLevel: row.bubbleAccessLevel,
    whatsappAccessLevel: row.whatsappAccessLevel,
    audioCheckpoint: row.audioCheckpoint,
    imageCheckpoint: row.imageCheckpoint,
    feedbackCheckpoint: row.feedbackCheckpoint,
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
    usesCodeDefaults: row.usesCodeDefaults,
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
    // CRÍTICO: NÃO copiar IDENTITY_BASE/DEFAULT_* do código pro banco
    // automaticamente. Isso era o BUG que causava drift dev/banco ,
    // dev editava o código, banco continuava com versão antiga, agente
    // lia do banco. Agora a flag `usesCodeDefaults` resolve: quando
    // true, mapSettings retorna do código sem precisar copiar.
    // Auto-reparo só pra campos não cobertos pela flag (terminology, etc).
    return mapSettings(existing as AgentSettingsRow);
  }

  // Primeira criação do singleton: deixa flag=true (default) e campos
  // do banco em branco/null. Agente usa código.
  const created = await prisma.agentSettings.upsert({
    where: { id: "global" },
    create: {
      id: "global",
      // usesCodeDefaults default true (declarado no schema)
      personality: "",
      tone: "",
      guardrails: [],
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
  feedbackInputEnabled: false,
  kbEnabled: true,
  kbInPlayground: true,
  suggestionsEnabled: true,
  suggestionsInPlayground: true,
  bubbleEnabled: true,
  whatsappEnabled: true,
  bubbleAccessLevel: "viewer",
  whatsappAccessLevel: "viewer",
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
        feedbackCheckpoint: true,
        kbCheckpoint: true,
        suggestionsCheckpoint: true,
        bubbleAccessLevel: true,
        whatsappAccessLevel: true,
        maxSuggestions: true,
      },
    });
    if (!settings) return DEFAULT_FLAGS;

    return {
      audioInputEnabled: settings.audioCheckpoint === "PRODUCTION",
      audioInPlayground: settings.audioCheckpoint !== "OFF",
      imageInputEnabled: settings.imageCheckpoint === "PRODUCTION",
      imageInPlayground: settings.imageCheckpoint !== "OFF",
      feedbackInputEnabled: settings.feedbackCheckpoint === "PRODUCTION",
      kbEnabled: settings.kbCheckpoint === "PRODUCTION",
      kbInPlayground: settings.kbCheckpoint !== "OFF",
      suggestionsEnabled: settings.suggestionsCheckpoint === "PRODUCTION",
      suggestionsInPlayground: settings.suggestionsCheckpoint !== "OFF",
      // bubbleEnabled/whatsappEnabled derivam do nível (compat ate C.6).
      bubbleEnabled: settings.bubbleAccessLevel !== "off",
      whatsappEnabled: settings.whatsappAccessLevel !== "off",
      bubbleAccessLevel: settings.bubbleAccessLevel,
      whatsappAccessLevel: settings.whatsappAccessLevel,
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
    // Auto-flip da flag pra false quando admin SALVA via UI. A partir
    // daqui, banco vira fonte da verdade até admin clicar em "Voltar
    // ao padrão do sistema" (que faz resetAgentSettingsToCodeDefaults).
    const common = {
      personality: data.personality,
      tone: data.tone,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      guardrails: data.guardrails as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      terminology: data.terminology as any,
      advancedOverride: data.advancedOverride ?? null,
      suggestionsEnabled: data.suggestionsEnabled,
      usesCodeDefaults: false,
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
    if (d.feedbackCheckpoint) {
      payload.feedbackCheckpoint = d.feedbackCheckpoint;
    }
    if (d.contextWindowCheckpoint) {
      payload.contextWindowCheckpoint = d.contextWindowCheckpoint;
    }
    if (d.contextWindowSize !== undefined) {
      payload.contextWindowSize = d.contextWindowSize;
    }
    if (d.contextWindowIncludeSystem !== undefined) {
      payload.contextWindowIncludeSystem = d.contextWindowIncludeSystem;
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
    revalidatePath("/agente/configuracao");

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
 * R2-ctx: atualiza a configuração do Router (bloco "Configuração de Router").
 * Construção da pergunta (Camada 2): provider/model/credencial + checkpoint +
 * nº de pares. Modelo de embedding do router (a credencial de embedding em si
 * é editada na ação de credencial de embedding, fonte única do RAG).
 */
export async function updateRouterConfig(
  input: UpdateRouterConfigInput,
): Promise<ActionResult> {
  try {
    const auth = await requireAdminOrAbove();
    if (!auth.ok) return { success: false, error: auth.error };

    const parsed = UpdateRouterConfigSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Dados de configuração do router inválidos" };
    }
    const d = parsed.data;

    const payload: Record<string, unknown> = {
      routerReformCheckpoint: d.routerReformCheckpoint,
    };
    if (d.routerReformProvider !== undefined) payload.routerReformProvider = d.routerReformProvider;
    if (d.routerReformModel !== undefined) payload.routerReformModel = d.routerReformModel;
    if (d.routerReformCredentialId !== undefined) payload.routerReformCredentialId = d.routerReformCredentialId;
    if (d.routerReformNPairs !== undefined) payload.routerReformNPairs = d.routerReformNPairs;
    if (d.routerEmbeddingModel !== undefined) payload.routerEmbeddingModel = d.routerEmbeddingModel;

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
      details: { kind: "router_config" },
    });

    revalidatePath("/agente/configuracao");

    return { success: true };
  } catch (err) {
    console.error("[updateRouterConfig]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao atualizar config do router",
    };
  }
}

/**
 * Atualiza a disponibilidade do Agente Nex em cada canal (bubble in-app e
 * WhatsApp). Persistido como dois níveis mínimos de acesso (com herança): "off"
 * desativa o canal; os demais valores são roles de PlatformRole. A UI mostra um
 * sumario de estados (off, so bubble, so whatsapp, ambos) + o nível escolhido.
 */
export async function updateAgentAvailability(input: {
  bubbleAccessLevel: ChannelAccessLevel;
  whatsappAccessLevel: ChannelAccessLevel;
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
        bubbleAccessLevel: input.bubbleAccessLevel,
        whatsappAccessLevel: input.whatsappAccessLevel,
      },
      update: {
        bubbleAccessLevel: input.bubbleAccessLevel,
        whatsappAccessLevel: input.whatsappAccessLevel,
      },
    });

    void logAudit({
      userId: auth.userId,
      action: "agent_settings_updated",
      targetType: "AgentSettings",
      targetId: "global",
      details: {
        kind: "availability",
        bubbleAccessLevel: input.bubbleAccessLevel,
        whatsappAccessLevel: input.whatsappAccessLevel,
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
    const activated = await prisma.llmConfig.update({
      where: { id: configId },
      data: { isActive: true },
      select: { id: true, model: true, provider: true },
    });

    // Onda 7 da modernizacao: reconciliar reasoning_effort/reasoning_checkpoint
    // de acordo com a capability do novo modelo. Evita estado invalido quando
    // admin troca para modelo que nao suporta reasoning ou usa adaptive mode.
    await reconcileReasoningEffort(activated.model);

    void logAudit({
      userId: auth.userId,
      action: "agent_settings_updated",
      targetType: "LlmConfig",
      targetId: configId,
      details: { provider: config.provider, model: activated.model },
    });

    revalidatePath("/agente/configuracao");
    revalidatePath("/agente/recursos");
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
 * Onda 7 da modernizacao: ajusta reasoning_effort e reasoning_checkpoint
 * em AgentSettings de acordo com a capability do novo modelo ativo.
 *
 * Regras (CRIT-A2-9 + MED-A2-14 da spec):
 *  1. cap null ou enabled=false: zera reasoning_effort e checkpoint=OFF.
 *  2. supportsWithTools=false: forca checkpoint=OFF (modelo nao suporta com tools).
 *  3. levels=["auto"]: forca reasoning_effort="auto".
 *  4. valor atual nao esta em cap.levels: troca para o mais alto suportado.
 */
async function reconcileReasoningEffort(newModelId: string): Promise<void> {
  const { reasoningCapsOf } = await import("@/lib/agent/llm/catalog");
  const cap = reasoningCapsOf(newModelId);
  const settings = await prisma.agentSettings.findUnique({
    where: { id: "global" },
    select: { reasoningEffort: true, reasoningCheckpoint: true },
  });
  if (!settings) return;

  const patch: { reasoningEffort?: string | null; reasoningCheckpoint?: "OFF" | "PLAYGROUND" | "PRODUCTION" } = {};

  if (!cap || !cap.enabled) {
    patch.reasoningEffort = null;
    patch.reasoningCheckpoint = "OFF";
  } else if (!cap.supportsWithTools) {
    patch.reasoningCheckpoint = "OFF";
  } else if (cap.levels.length === 1 && cap.levels[0] === "auto") {
    patch.reasoningEffort = "auto";
  } else if (
    settings.reasoningEffort
    && !(cap.levels as string[]).includes(settings.reasoningEffort)
  ) {
    patch.reasoningEffort = cap.levels[cap.levels.length - 1];
  }

  if (Object.keys(patch).length > 0) {
    await prisma.agentSettings.update({
      where: { id: "global" },
      data: patch,
    });
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

/**
 * Volta o prompt ao padrão do sistema (código).
 *
 * Use quando o admin quer descartar customizações feitas via UI e voltar
 * a usar identityBase/personality/tone/guardrails do código. Marca a
 * flag `usesCodeDefaults = true` (campos do banco passam a ser ignorados
 * por mapSettings , ver agent-config.ts).
 *
 * Os campos no banco NÃO são apagados (preserva histórico caso admin
 * queira reverter). Só a flag controla a fonte.
 */
export async function resetAgentSettingsToCodeDefaults(): Promise<ActionResult> {
  try {
    const auth = await requireAdminOrAbove();
    if (!auth.ok) return { success: false, error: auth.error };

    await prisma.agentSettings.update({
      where: { id: "global" },
      data: { usesCodeDefaults: true },
    });

    void logAudit({
      userId: auth.userId,
      action: "agent_settings_updated",
      targetType: "AgentSettings",
      targetId: "global",
    });

    revalidatePath("/agente");
    revalidatePath("/agente/prompt");
    return { success: true };
  } catch (err) {
    console.error("[resetAgentSettingsToCodeDefaults]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao restaurar padrão",
    };
  }
}
