// src/worker/sync/processors.ts
import type { PrismaClient } from "../../generated/prisma/client";
import type { OdooClient } from "../odoo/client";
import type { CatalogEntry } from "../catalog/model-catalog";
import { runModelCycle, type CycleDeps } from "./sync-engine";
import { markRunning, markOk, markError, markNoAccess, ensureSyncState } from "./sync-state";
import { syncIncremental } from "./incremental";
import { syncSnapshot } from "./snapshot";
import { reconcileModel } from "./reconcile";
import { rawDelegateKey } from "../jobs";

export interface CycleContext {
  prisma: PrismaClient;
  client: OdooClient;
}

type RunCycleFn = typeof runModelCycle;

/** Interface mínima para contar registros numa tabela raw do Prisma. */
interface RawDelegateWithCount {
  count(args: { where: { rawDeleted: boolean } }): Promise<number>;
}

function rawDelegate(prisma: PrismaClient, odooModel: string): Record<string, unknown> {
  return (prisma as unknown as Record<string, Record<string, unknown>>)[rawDelegateKey(odooModel)];
}

function rawDelegateCount(prisma: PrismaClient, odooModel: string): Promise<number> {
  const delegate = rawDelegate(prisma, odooModel) as unknown as RawDelegateWithCount;
  return delegate.count({ where: { rawDeleted: false } });
}

export async function processIncrementalCycle(
  ctx: CycleContext,
  catalog: readonly CatalogEntry[],
  runCycle: RunCycleFn = runModelCycle,
): Promise<void> {
  for (const entry of catalog) {
    if (entry.mode !== "incremental") continue;
    // Garante a linha de SyncState antes do ciclo: o runner pode assumir
    // que ela existe (WR-03).
    await ensureSyncState(ctx.prisma, entry.odooModel, entry.mode);
    const deps: CycleDeps = {
      prisma: ctx.prisma,
      client: ctx.client,
      cycle: "incremental",
      markRunning,
      markOk,
      markError,
      markNoAccess,
      runner: async (model) => {
        const state = await ctx.prisma.syncState.findUnique({ where: { model } });
        const { watermark } = await syncIncremental(
          ctx.client,
          rawDelegate(ctx.prisma, model) as never,
          model,
          state?.lastIncrementalAt ?? null,
        );
        const count = await rawDelegateCount(ctx.prisma, model);
        return { count, watermark };
      },
    };
    await runCycle(deps, entry.odooModel);
  }
}

export async function processSnapshotCycle(
  ctx: CycleContext,
  catalog: readonly CatalogEntry[],
  runCycle: RunCycleFn = runModelCycle,
): Promise<void> {
  for (const entry of catalog) {
    if (entry.mode !== "snapshot" && entry.mode !== "estatico") continue;
    await ensureSyncState(ctx.prisma, entry.odooModel, entry.mode);
    const deps: CycleDeps = {
      prisma: ctx.prisma,
      client: ctx.client,
      cycle: "snapshot",
      markRunning,
      markOk,
      markError,
      markNoAccess,
      runner: async (model) => {
        await syncSnapshot(
          ctx.client,
          ctx.prisma as never,
          rawDelegateKey(model),
          model,
        );
        const count = await rawDelegateCount(ctx.prisma, model);
        return { count };
      },
    };
    await runCycle(deps, entry.odooModel);
  }

  // Fato provisório: reconstruir após o snapshot de estoque.saldo.hoje.
  const { rebuildFatoEstoqueSaldo } = await import("../fatos/fato-estoque-saldo");
  try {
    const n = await rebuildFatoEstoqueSaldo(ctx.prisma);
    console.log(`[worker] fato_estoque_saldo reconstruído: ${n} linhas`);
  } catch (err) {
    console.error("[worker] falha ao reconstruir fato_estoque_saldo:", err);
  }
}

export async function processReconcileCycle(
  ctx: CycleContext,
  catalog: readonly CatalogEntry[],
  runCycle: RunCycleFn = runModelCycle,
): Promise<void> {
  for (const entry of catalog) {
    // Modelos estáticos não têm registros removidos no Odoo — reconcile é
    // desperdício e ainda arrisca marcar registros vivos como apagados se a
    // listagem de ids vier truncada (WR-08).
    if (entry.mode === "estatico") continue;
    await ensureSyncState(ctx.prisma, entry.odooModel, entry.mode);
    const deps: CycleDeps = {
      prisma: ctx.prisma,
      client: ctx.client,
      cycle: "reconcile",
      markRunning,
      markOk,
      markError,
      markNoAccess,
      runner: async (model) => {
        await reconcileModel(ctx.client, rawDelegate(ctx.prisma, model) as never, model);
        const count = await rawDelegateCount(ctx.prisma, model);
        return { count };
      },
    };
    await runCycle(deps, entry.odooModel);
  }
}
