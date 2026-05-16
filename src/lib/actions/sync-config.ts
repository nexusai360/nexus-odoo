"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { syncConfigSchema, syncIntervalValueSchema } from "@/lib/validations/sync-config";

const KEY_OF = {
  incrementalIntervalMin: "sync.incremental_interval_min",
  snapshotIntervalMin: "sync.snapshot_interval_min",
  reconcileIntervalMin: "sync.reconcile_interval_min",
} as const;

const SYNC_CONFIG_DEFAULTS = {
  incrementalIntervalMin: 3,
  snapshotIntervalMin: 1440,
  reconcileIntervalMin: 1440,
} as const;

/**
 * Lê um valor de AppSetting como intervalo de sync. Dado corrompido (string,
 * objeto, NaN) cai no default com aviso, em vez de devolver NaN para a UI
 * (WR-09) — alinhado à validação do worker.
 */
function readInterval(value: unknown, fallback: number, key: string): number {
  const parsed = syncIntervalValueSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  console.warn(
    `[sync-config] AppSetting "${key}" com valor inválido (${JSON.stringify(value)}) — usando default ${fallback}`,
  );
  return fallback;
}

export async function getSyncConfig() {
  const me = await getCurrentUser();
  if (!me || me.platformRole !== "super_admin") {
    throw new Error("Acesso negado");
  }
  const rows = await prisma.appSetting.findMany({ where: { category: "sync" } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return {
    incrementalIntervalMin: readInterval(
      byKey.get(KEY_OF.incrementalIntervalMin),
      SYNC_CONFIG_DEFAULTS.incrementalIntervalMin,
      KEY_OF.incrementalIntervalMin,
    ),
    snapshotIntervalMin: readInterval(
      byKey.get(KEY_OF.snapshotIntervalMin),
      SYNC_CONFIG_DEFAULTS.snapshotIntervalMin,
      KEY_OF.snapshotIntervalMin,
    ),
    reconcileIntervalMin: readInterval(
      byKey.get(KEY_OF.reconcileIntervalMin),
      SYNC_CONFIG_DEFAULTS.reconcileIntervalMin,
      KEY_OF.reconcileIntervalMin,
    ),
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
