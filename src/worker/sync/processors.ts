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

/**
 * Pool de promises simples: roda `worker(item)` para cada item com
 * concorrencia maxima `limit`. Quando um slot libera, pega o proximo.
 * Erros individuais sao logados mas nao param o pool (cycle nao deve
 * abortar se 1 tabela falhar; cada tabela ja tem markError no runCycle).
 */
async function pool<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let idx = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      try {
        await worker(items[i]);
      } catch (err) {
        console.error("[worker] tabela falhou no pool:", err);
      }
    }
  });
  await Promise.all(runners);
}

/** Concorrencia do incremental: 5 tabelas em paralelo.
 *  Jornada: sequencial(1) -> 5 -> 10 -> 5.
 *  Com 10, o worker bateu OOM (FATAL "Ineffective mark-compacts near
 *  heap limit") porque o pool carregava 10 tabelas pesadas em memoria
 *  ao mesmo tempo (sped.documento.item=214k, sped.documento=47k, etc).
 *  Heap default de 2GB nao aguentou. Voltamos pra 5 e subimos heap pra
 *  4GB via NODE_OPTIONS no docker-compose.yml. Esperado: cycle ~5-8min,
 *  estavel, sem OOM, sem restart loop. */
const INCREMENTAL_CONCURRENCY = 5;

export async function processIncrementalCycle(
  ctx: CycleContext,
  catalog: readonly CatalogEntry[],
  runCycle: RunCycleFn = runModelCycle,
): Promise<void> {
  const incrementalEntries = catalog.filter((e) => e.mode === "incremental");
  await pool(incrementalEntries, INCREMENTAL_CONCURRENCY, async (entry) => {
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
  });
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
        const r = await reconcileModel(ctx.client, rawDelegate(ctx.prisma, model) as never, model);
        // O reparo não pode ser silencioso: se a reconciliação está inserindo faltante todo
        // dia, é sinal de que a ingestão voltou a perder registro, e alguém precisa ver isso.
        if (r.inseridosFaltantes || r.ressuscitados) {
          console.warn(
            `[reconcile] ${model}: ${r.inseridosFaltantes} faltante(s) trazido(s) do Odoo, ` +
              `${r.ressuscitados} ressuscitado(s), ${r.marcadosDeletados} marcado(s) como deletado(s)`,
          );
        }
        const count = await rawDelegateCount(ctx.prisma, model);
        return { count };
      },
    };
    await runCycle(deps, entry.odooModel);
  }
}
