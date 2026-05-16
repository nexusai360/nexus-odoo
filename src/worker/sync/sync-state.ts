// src/worker/sync/sync-state.ts
import type { PrismaClient } from "../../generated/prisma/client";
import type { SyncMode } from "../catalog/model-catalog";

export type CycleKind = "incremental" | "snapshot" | "reconcile";

const TIMESTAMP_FIELD: Record<CycleKind, string> = {
  incremental: "lastIncrementalAt",
  snapshot: "lastSnapshotAt",
  reconcile: "lastReconcileAt",
};

/**
 * Garante que a linha de SyncState do modelo existe antes do ciclo rodar.
 * Chamado no início do loop de cada processador: um modelo adicionado ao
 * catálogo depois do último seed não pode derrubar o ciclo com P2025
 * quando os helpers mark* fazem `update` (WR-02/WR-03).
 */
export function ensureSyncState(prisma: PrismaClient, model: string, mode: SyncMode) {
  return prisma.syncState.upsert({
    where: { model },
    update: { mode },
    create: { model, mode },
  });
}

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
  watermark?: Date,
) {
  // Para o ciclo incremental, `watermark` é o instante capturado ANTES do
  // fetch (CR-01). Sem watermark, usa o instante de conclusão.
  const timestamp = watermark ?? new Date();
  return prisma.syncState.update({
    where: { model },
    data: {
      lastStatus: "ok",
      lastError: null,
      recordCount,
      [TIMESTAMP_FIELD[cycle]]: timestamp,
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
