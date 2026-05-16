// src/worker/sync/sync-engine.ts
import type { PrismaClient } from "../../generated/prisma/client";
import type { OdooClient } from "../odoo/client";
import { isAccessError } from "../odoo/errors";
import type { CycleKind } from "./sync-state";

export interface CycleDeps {
  prisma: PrismaClient;
  client: OdooClient;
  cycle: CycleKind;
  markRunning: (p: PrismaClient, m: string) => Promise<unknown>;
  markOk: (p: PrismaClient, m: string, c: CycleKind, n: number) => Promise<unknown>;
  markError: (p: PrismaClient, m: string, msg: string) => Promise<unknown>;
  markNoAccess: (p: PrismaClient, m: string) => Promise<unknown>;
  /** Executa o sync do modelo e devolve a contagem de registros. */
  runner: (model: string) => Promise<number>;
}

/**
 * Roda o ciclo de UM modelo com isolamento de falha total: nenhuma exceção
 * escapa. Erro comum -> markError; AccessError -> markNoAccess; ok -> markOk.
 */
export async function runModelCycle(deps: CycleDeps, model: string): Promise<void> {
  try {
    await deps.markRunning(deps.prisma, model);
    const n = await deps.runner(model);
    await deps.markOk(deps.prisma, model, deps.cycle, n);
  } catch (exc) {
    if (isAccessError(exc)) {
      await deps.markNoAccess(deps.prisma, model);
      return;
    }
    const msg = exc instanceof Error ? exc.message : String(exc);
    await deps.markError(deps.prisma, model, msg);
  }
}
