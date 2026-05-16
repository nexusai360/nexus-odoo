// src/worker/sync/sync-config.ts
import type { PrismaClient } from "../../generated/prisma/client";

export interface SyncConfig {
  incrementalIntervalMin: number;
  snapshotIntervalMin: number;
  reconcileIntervalMin: number;
}

export const SYNC_CONFIG_DEFAULTS: SyncConfig = {
  incrementalIntervalMin: 3,
  snapshotIntervalMin: 1440,
  reconcileIntervalMin: 1440,
};

const KEY_MAP: Record<string, keyof SyncConfig> = {
  "sync.incremental_interval_min": "incrementalIntervalMin",
  "sync.snapshot_interval_min": "snapshotIntervalMin",
  "sync.reconcile_interval_min": "reconcileIntervalMin",
};

export async function readSyncConfig(prisma: PrismaClient): Promise<SyncConfig> {
  const rows = await prisma.appSetting.findMany({ where: { category: "sync" } });
  const cfg = { ...SYNC_CONFIG_DEFAULTS };
  for (const row of rows) {
    const field = KEY_MAP[row.key];
    if (field && typeof row.value === "number" && row.value > 0) {
      cfg[field] = row.value;
    }
  }
  return cfg;
}
