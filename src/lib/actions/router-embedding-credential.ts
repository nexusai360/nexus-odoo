"use server";

/**
 * R1 router de catalogo: server actions para gerenciar a credencial OpenAI
 * usada por embed() — o `embedding_credential_id` em AppSetting (consumido
 * por src/lib/agent/rag/embed.ts).
 *
 * O usuario quer poder trocar a chave usada pelo router sem mexer no resto
 * do projeto. Por enquanto restrito ao provider `openai` (decisao do
 * usuario 2026-05-28).
 *
 * Auto-fill: se a config nunca foi setada, mas existe pelo menos uma
 * LlmCredential de provider=openai, retorna ela como sugestao (mas NAO
 * salva automaticamente — o admin clica em "Usar esta" pra confirmar).
 */

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";

const SETTING_KEY = "embedding_credential_id";
const ALLOWED_PROVIDER = "openai";

export type EmbeddingCredentialOption = {
  id: string;
  label: string;
  last4: string;
  provider: string;
  createdAt: Date;
};

export type EmbeddingCredentialStatus = {
  /** Credencial ativa (null se nao configurada). */
  active: EmbeddingCredentialOption | null;
  /** Todas as credenciais OpenAI disponiveis para escolher. */
  options: EmbeddingCredentialOption[];
  /** True quando nada foi configurado mas ha pelo menos 1 opcao. */
  needsBootstrap: boolean;
};

export async function getEmbeddingCredentialStatus(): Promise<EmbeddingCredentialStatus> {
  const [setting, credentials] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: SETTING_KEY } }),
    prisma.llmCredential.findMany({
      where: { provider: ALLOWED_PROVIDER },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        label: true,
        last4: true,
        provider: true,
        createdAt: true,
      },
    }),
  ]);

  const activeId = typeof setting?.value === "string" ? setting.value : null;
  const active =
    credentials.find((c) => c.id === activeId) ?? null;

  return {
    active,
    options: credentials,
    needsBootstrap: !active && credentials.length > 0,
  };
}

const updateInputSchema = z.object({
  credentialId: z.string().uuid("credentialId invalido"),
});

export type UpdateEmbeddingCredentialResult =
  | { ok: true; active: EmbeddingCredentialOption }
  | { ok: false; error: string };

export async function setEmbeddingCredential(
  input: z.input<typeof updateInputSchema>,
): Promise<UpdateEmbeddingCredentialResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Nao autenticado" };
  if (user.platformRole !== "super_admin") {
    return { ok: false, error: "Acesso negado" };
  }

  const rl = await checkRateLimit(
    `router-embedding-credential:${user.id}`,
    10,
    60,
  );
  if (!rl.allowed) {
    return {
      ok: false,
      error: `Limite de alteracoes excedido. Tente em ${rl.retryAfterSeconds ?? 60}s.`,
    };
  }

  const parsed = updateInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Input invalido" };
  }

  const credential = await prisma.llmCredential.findUnique({
    where: { id: parsed.data.credentialId },
    select: {
      id: true,
      label: true,
      last4: true,
      provider: true,
      createdAt: true,
    },
  });
  if (!credential) {
    return { ok: false, error: "Credencial nao encontrada" };
  }
  if (credential.provider !== ALLOWED_PROVIDER) {
    return {
      ok: false,
      error: `Apenas credenciais OpenAI sao permitidas (recebido: ${credential.provider}).`,
    };
  }

  // Snapshot do valor anterior para audit.
  const previousSetting = await prisma.appSetting.findUnique({
    where: { key: SETTING_KEY },
  });
  const previousId =
    typeof previousSetting?.value === "string"
      ? previousSetting.value
      : null;

  // UPSERT da chave em app_settings. Mantemos a categoria 'agent' alinhada
  // com o uso interno (embed e' parte do agente).
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: {
      key: SETTING_KEY,
      value: credential.id,
      description: "Credencial OpenAI usada por embed() do RAG e do router.",
      category: "agent",
      updatedById: user.id,
    },
    update: {
      value: credential.id,
      updatedById: user.id,
    },
  });

  await logAudit({
    userId: user.id,
    action: "setting_updated",
    targetType: "app_setting",
    targetId: SETTING_KEY,
    details: {
      setting: SETTING_KEY,
      previous: previousId,
      next: credential.id,
      via: "router_embedding_credential_picker",
      credentialLabel: credential.label,
      credentialLast4: credential.last4,
    },
  });

  return { ok: true, active: credential };
}
