"use server";

/**
 * R1 router de catalogo: server actions para o painel admin.
 *
 * Spec: docs/superpowers/specs/2026-05-28-router-catalogo-design.md §10.1.5.
 * Plan: docs/superpowers/plans/2026-05-28-router-catalogo-plan.md §D3.
 *
 * Gates de seguranca:
 *  - Apenas super_admin pode mudar settings.
 *  - Ativacao do router (routerEnabled: false -> true) e' bloqueada se o gate
 *    de qualidade (D2e.eligible) for `false`, exceto quando `bypassGate=true`
 *    e' passado explicitamente pelo super_admin (dialogo de confirmacao forte).
 *  - Rate limit: 10 alteracoes / 60s por usuario. Via redis.
 *  - Audit em AuditLog `setting_updated` para cada chave alterada.
 */

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRouterEligibleToActivate } from "@/lib/agent/router/queries";

const updateInputSchema = z.object({
  routerEnabled: z.boolean().optional(),
  routerThreshold: z.number().min(0.15).max(0.9).optional(),
  routerTopK: z.number().int().min(1).max(6).optional(),
  routerRetryExpandBelow: z.number().min(0.3).max(0.95).optional(),
  routerRetryEnabled: z.boolean().optional(),
  /** Bypass do gate de seguranca (so super_admin, via dialogo). */
  bypassGate: z.boolean().default(false),
});

export type UpdateRouterSettingsInput = z.input<typeof updateInputSchema>;
export type UpdateRouterSettingsResult =
  | { ok: true; settings: RouterSettingsSnapshot }
  | { ok: false; error: string };

export type RouterSettingsSnapshot = {
  routerEnabled: boolean;
  routerThreshold: number;
  routerTopK: number;
  routerRetryExpandBelow: number;
  routerRetryEnabled: boolean;
};

export async function getRouterSettings(): Promise<
  RouterSettingsSnapshot | null
> {
  const row = await prisma.agentSettings.findUnique({
    where: { id: "global" },
    select: {
      routerEnabled: true,
      routerThreshold: true,
      routerTopK: true,
      routerRetryExpandBelow: true,
      routerRetryEnabled: true,
    },
  });
  return row ?? null;
}

export async function updateRouterSettings(
  input: UpdateRouterSettingsInput,
): Promise<UpdateRouterSettingsResult> {
  // 1. Auth.
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Nao autenticado" };
  if (user.platformRole !== "super_admin") {
    return { ok: false, error: "Acesso negado" };
  }

  // 2. Rate limit (10/min/user).
  const rl = await checkRateLimit(
    `router-settings:${user.id}`,
    10,
    60,
  );
  if (!rl.allowed) {
    return {
      ok: false,
      error: `Limite de alteracoes excedido. Tente novamente em ${rl.retryAfterSeconds ?? 60}s.`,
    };
  }

  // 3. Validacao.
  const parsed = updateInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }
  const data = parsed.data;
  const { bypassGate, ...changes } = data;
  const fields: Array<keyof RouterSettingsSnapshot> = [
    "routerEnabled",
    "routerThreshold",
    "routerTopK",
    "routerRetryExpandBelow",
    "routerRetryEnabled",
  ];
  const willChange = fields.some(
    (k) => (changes as Record<string, unknown>)[k] !== undefined,
  );
  if (!willChange) {
    return { ok: false, error: "Nenhuma alteracao informada." };
  }

  // 4. Estado anterior + gate de seguranca (so se ligar o router).
  const before = await prisma.agentSettings.findUnique({
    where: { id: "global" },
    select: {
      routerEnabled: true,
      routerThreshold: true,
      routerTopK: true,
      routerRetryExpandBelow: true,
      routerRetryEnabled: true,
    },
  });
  if (!before) {
    return { ok: false, error: "AgentSettings nao inicializado." };
  }
  const turningOn =
    changes.routerEnabled === true && before.routerEnabled === false;
  if (turningOn && !bypassGate) {
    const elig = await getRouterEligibleToActivate();
    if (!elig.eligible) {
      return {
        ok: false,
        error: `Ativacao bloqueada pelo gate de seguranca: ${elig.reason}. Use bypassGate=true via dialogo de confirmacao para forcar.`,
      };
    }
  }

  // 5. UPDATE.
  const updateData: Partial<RouterSettingsSnapshot> = {};
  for (const k of fields) {
    const v = (changes as Record<string, unknown>)[k];
    if (v !== undefined) {
      (updateData as Record<string, unknown>)[k] = v;
    }
  }
  const updated = await prisma.agentSettings.update({
    where: { id: "global" },
    data: updateData,
    select: {
      routerEnabled: true,
      routerThreshold: true,
      routerTopK: true,
      routerRetryExpandBelow: true,
      routerRetryEnabled: true,
    },
  });

  // 6. Audit log por chave alterada.
  for (const k of fields) {
    const prev = (before as Record<string, unknown>)[k];
    const next = (updated as Record<string, unknown>)[k];
    if (prev !== next) {
      await logAudit({
        userId: user.id,
        action: "setting_updated",
        targetType: "agent_settings",
        targetId: "global",
        details: {
          setting: snakeCase(k),
          previous: prev,
          next,
          via: "router_settings_action",
          bypassGate,
        },
      });
    }
  }

  return { ok: true, settings: updated };
}

function snakeCase(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}
