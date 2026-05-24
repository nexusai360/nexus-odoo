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
import { runBuilders } from "../fatos/registry";

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
  try {
    await runBuilders(ctx.prisma, "incremental");
  } catch (err) {
    console.error("[worker] falha ao rodar builders incrementais:", err);
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

  await runBuilders(ctx.prisma, "snapshot");
}

export async function processReconcileCycle(
  ctx: CycleContext,
  catalog: readonly CatalogEntry[],
  runCycle: RunCycleFn = runModelCycle,
): Promise<void> {
  for (const entry of catalog) {
    // Reconcile só faz sentido em modelos incrementais: linhas se acumulam e
    // exclusões individuais precisam ser detectadas. Modelos snapshot são
    // recriados por completo a cada ciclo e seus ids no Odoo rotacionam ,
    // comparar ids marcaria a tabela raw inteira como rawDeleted (WR-08).
    // Modelos estáticos também não têm remoções detectáveis.
    if (entry.mode !== "incremental") continue;
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
