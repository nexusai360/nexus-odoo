// src/worker/sync/sync-engine.ts
import type { PrismaClient } from "../../generated/prisma/client";
import type { OdooClient } from "../odoo/client";
import { isAccessError } from "../odoo/errors";
import type { CycleKind } from "./sync-state";

/** Resultado de um runner de ciclo: contagem + watermark opcional. */
export interface RunnerResult {
  count: number;
  /**
   * Timestamp a persistir como `last*At`. Para ciclos incrementais é o
   * instante capturado ANTES do fetch (CR-01). Quando ausente, o `markOk`
   * usa o instante de conclusão.
   */
  watermark?: Date;
}

export interface CycleDeps {
  prisma: PrismaClient;
  client: OdooClient;
  cycle: CycleKind;
  markRunning: (p: PrismaClient, m: string) => Promise<unknown>;
  markOk: (p: PrismaClient, m: string, c: CycleKind, n: number, watermark?: Date) => Promise<unknown>;
  markError: (p: PrismaClient, m: string, msg: string) => Promise<unknown>;
  markNoAccess: (p: PrismaClient, m: string) => Promise<unknown>;
  /** Executa o sync do modelo e devolve a contagem e o watermark. */
  runner: (model: string) => Promise<RunnerResult>;
}

/**
 * Roda o ciclo de UM modelo com isolamento de falha total: nenhuma exceção
 * escapa. Erro comum -> markError; AccessError -> markNoAccess; ok -> markOk.
 */
export async function runModelCycle(deps: CycleDeps, model: string): Promise<void> {
  try {
    await deps.markRunning(deps.prisma, model);
    const result = await deps.runner(model);
    await deps.markOk(deps.prisma, model, deps.cycle, result.count, result.watermark);
  } catch (exc) {
    // O catch nunca pode lançar: um mark* que falhe (ex.: linha ausente)
    // não pode escapar e abortar o loop de ciclos (WR-02).
    try {
      if (isAccessError(exc)) {
        await deps.markNoAccess(deps.prisma, model);
        return;
      }
      const msg = exc instanceof Error ? exc.message : String(exc);
      await deps.markError(deps.prisma, model, msg);
    } catch (markExc) {
      console.error(`[sync-engine] falha ao registrar estado de "${model}":`, markExc);
    }
  }
}
