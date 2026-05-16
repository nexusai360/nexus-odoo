// src/worker/sync/sync-state.ts
import type { PrismaClient } from "../../generated/prisma/client";

export type CycleKind = "incremental" | "snapshot" | "reconcile";

const TIMESTAMP_FIELD: Record<CycleKind, string> = {
  incremental: "lastIncrementalAt",
  snapshot: "lastSnapshotAt",
  reconcile: "lastReconcileAt",
};

export function markRunning(prisma: PrismaClient, model: string) {
  return prisma.syncState.update({
    where: { model },
    data: { lastStatus: "rodando" },
  });
}

export function markOk(
  prisma: PrismaClient,
  model: string,
  cycle: CycleKind,
  recordCount: number,
) {
  return prisma.syncState.update({
    where: { model },
    data: {
      lastStatus: "ok",
      lastError: null,
      recordCount,
      [TIMESTAMP_FIELD[cycle]]: new Date(),
    },
  });
}

export function markError(prisma: PrismaClient, model: string, message: string) {
  return prisma.syncState.update({
    where: { model },
    data: { lastStatus: "erro", lastError: message.slice(0, 500) },
  });
}

export function markNoAccess(prisma: PrismaClient, model: string) {
  return prisma.syncState.update({
    where: { model },
    data: { lastStatus: "sem_acesso" },
  });
}
