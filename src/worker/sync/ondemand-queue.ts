// src/worker/sync/ondemand-queue.ts
// Acessor LAZY da fila de sync sob demanda. Espelha o padrão de
// mcp/sync/queue.ts (getDirectedSyncQueue): singleton por processo, conexão
// Redis própria, ZERO `new Worker`. Pode ser importado pelo app Next sem subir
// Workers nem reagendar crons (NÃO importar worker/index.ts, que tem side effects).
//
// Enfileira na MESMA fila do cron (ODOO_SYNC_QUEUE_NAME = "odoo-sync"), para que
// o Worker já existente processe o job. O job é one-shot (queue.add), nunca um
// JobScheduler repeat, então não altera o agendamento do cron.

import { Queue } from "bullmq";
import IORedis from "ioredis";

import { ODOO_SYNC_QUEUE_NAME } from "@/worker/jobs";

/** Payload do job de sync sob demanda: os modelos Odoo a re-sincronizar. */
export interface OndemandSyncJob {
  models: string[];
}

let _queue: Queue<OndemandSyncJob> | null = null;

/** Retorna (ou inicializa) a fila de sync sob demanda. Singleton por processo. */
export function getOndemandSyncQueue(): Queue<OndemandSyncJob> {
  if (_queue) return _queue;
  _queue = new Queue<OndemandSyncJob>(ODOO_SYNC_QUEUE_NAME, {
    connection: new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    }),
  });
  return _queue;
}
