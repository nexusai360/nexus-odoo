"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const syncConfigSchema = z.object({
  incrementalIntervalMin: z.number().int().min(1).max(1440),
  snapshotIntervalMin: z.number().int().min(1).max(10080),
  reconcileIntervalMin: z.number().int().min(1).max(10080),
});

const KEY_OF = {
  incrementalIntervalMin: "sync.incremental_interval_min",
  snapshotIntervalMin: "sync.snapshot_interval_min",
  reconcileIntervalMin: "sync.reconcile_interval_min",
} as const;

export async function getSyncConfig() {
  const me = await getCurrentUser();
  if (!me || me.platformRole !== "super_admin") {
    throw new Error("Acesso negado");
  }
  const rows = await prisma.appSetting.findMany({ where: { category: "sync" } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return {
    incrementalIntervalMin: Number(byKey.get(KEY_OF.incrementalIntervalMin) ?? 3),
    snapshotIntervalMin: Number(byKey.get(KEY_OF.snapshotIntervalMin) ?? 1440),
    reconcileIntervalMin: Number(byKey.get(KEY_OF.reconcileIntervalMin) ?? 1440),
  };
}

export async function getSyncState() {
  const me = await getCurrentUser();
  if (!me || me.platformRole !== "super_admin") {
    throw new Error("Acesso negado");
  }
  return prisma.syncState.findMany({ orderBy: { model: "asc" } });
}

export async function updateSyncConfig(input: unknown) {
  const me = await getCurrentUser();
  if (!me || me.platformRole !== "super_admin") {
    throw new Error("Acesso negado");
  }
  const parsed = syncConfigSchema.parse(input);
  for (const [field, key] of Object.entries(KEY_OF)) {
    await prisma.appSetting.upsert({
      where: { key },
      update: {
        value: parsed[field as keyof typeof parsed],
        updatedById: me.id,
      },
      create: {
        key,
        value: parsed[field as keyof typeof parsed],
        category: "sync",
        updatedById: me.id,
      },
    });
  }
  await logAudit({
    userId: me.id,
    action: "setting_updated",
    targetType: "sync_config",
    details: { scope: "sync", ...parsed },
  });
  return { ok: true };
}
