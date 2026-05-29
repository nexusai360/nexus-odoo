"use server";

/**
 * Server actions para gerenciar o intervalo (em minutos) da auditoria
 * heuristica automatica do agente. Configuracao vive em AgentSettings.
 * O worker reaplica o agendamento BullMQ em <= 60s via JOB_CONFIG_CHECK.
 */

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";

const INPUT = z.object({
  intervalMinutes: z
    .number()
    .int("Deve ser inteiro")
    .min(1, "Minimo 1 minuto")
    .max(1440, "Maximo 1440 minutos (24h)"),
});

export type QualityHeuristicConfig = {
  intervalMinutes: number;
};

export async function getQualityHeuristicConfig(): Promise<QualityHeuristicConfig> {
  const row = await prisma.agentSettings.findUnique({
    where: { id: "global" },
    select: { qualityHeuristicIntervalMinutes: true },
  });
  return { intervalMinutes: row?.qualityHeuristicIntervalMinutes ?? 240 };
}

export type UpdateQualityHeuristicResult =
  | { ok: true; intervalMinutes: number }
  | { ok: false; error: string };

export async function updateQualityHeuristicConfig(
  input: z.input<typeof INPUT>,
): Promise<UpdateQualityHeuristicResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Nao autenticado" };
  if (user.platformRole !== "super_admin") {
    return { ok: false, error: "Acesso negado" };
  }
  const rl = await checkRateLimit(
    `quality-heuristic-config:${user.id}`,
    10,
    60,
  );
  if (!rl.allowed) {
    return {
      ok: false,
      error: `Limite excedido. Tente em ${rl.retryAfterSeconds ?? 60}s.`,
    };
  }
  const parsed = INPUT.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Input invalido",
    };
  }
  const before = await prisma.agentSettings.findUnique({
    where: { id: "global" },
    select: { qualityHeuristicIntervalMinutes: true },
  });
  const previous = before?.qualityHeuristicIntervalMinutes ?? null;
  await prisma.agentSettings.update({
    where: { id: "global" },
    data: { qualityHeuristicIntervalMinutes: parsed.data.intervalMinutes },
  });
  if (previous !== parsed.data.intervalMinutes) {
    await logAudit({
      userId: user.id,
      action: "setting_updated",
      targetType: "agent_settings",
      targetId: "global",
      details: {
        setting: "quality_heuristic_interval_minutes",
        previous,
        next: parsed.data.intervalMinutes,
      },
    });
  }
  return { ok: true, intervalMinutes: parsed.data.intervalMinutes };
}
