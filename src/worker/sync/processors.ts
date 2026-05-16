// src/worker/sync/processors.ts
import type { PrismaClient } from "../../generated/prisma/client";
import type { OdooClient } from "../odoo/client";
import type { CatalogEntry } from "../catalog/model-catalog";
import { runModelCycle, type CycleDeps } from "./sync-engine";
import { markRunning, markOk, markError, markNoAccess } from "./sync-state";
import { syncIncremental } from "./incremental";
import { syncSnapshot } from "./snapshot";
import { reconcileModel } from "./reconcile";
import { rawDelegateKey } from "../jobs";

export interface CycleContext {
  prisma: PrismaClient;
  client: OdooClient;
}

type RunCycleFn = typeof runModelCycle;

function rawDelegate(prisma: PrismaClient, odooModel: string): Record<string, unknown> {
  return (prisma as unknown as Record<string, Record<string, unknown>>)[rawDelegateKey(odooModel)];
}

export async function processIncrementalCycle(
  ctx: CycleContext,
  catalog: readonly CatalogEntry[],
  runCycle: RunCycleFn = runModelCycle,
): Promise<void> {
  for (const entry of catalog) {
    if (entry.mode !== "incremental") continue;
    const deps: CycleDeps = {
      prisma: ctx.prisma,
      client: ctx.client,
      cycle: "incremental",
      markRunning,
      markOk,
      markError,
      markNoAccess,
      runner: async (model) => {
        const state = await ctx.prisma.syncState.findUniqueOrThrow({ where: { model } });
        return syncIncremental(
          ctx.client,
          rawDelegate(ctx.prisma, model) as never,
          model,
          state.lastIncrementalAt,
        );
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
    const deps: CycleDeps = {
      prisma: ctx.prisma,
      client: ctx.client,
      cycle: "snapshot",
      markRunning,
      markOk,
      markError,
      markNoAccess,
      runner: (model) =>
        syncSnapshot(ctx.client, ctx.prisma as never, rawDelegateKey(model), model),
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
    const deps: CycleDeps = {
      prisma: ctx.prisma,
      client: ctx.client,
      cycle: "reconcile",
      markRunning,
      markOk,
      markError,
      markNoAccess,
      runner: (model) => reconcileModel(ctx.client, rawDelegate(ctx.prisma, model) as never, model),
    };
    await runCycle(deps, entry.odooModel);
  }
}
