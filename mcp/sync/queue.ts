// mcp/sync/queue.ts
// Fila BullMQ para sync direcionado , disparada por tools do MCP após mutações.
// O worker (src/worker/sync/directed.ts) consome esta fila e aplica as mudanças
// no cache Postgres, coordenando com o cron incremental via lock Redis.

import { Queue } from "bullmq";
import IORedis from "ioredis";

/** Payload de um job de sync direcionado. */
export interface DirectedSyncJob {
  /** Modelo Odoo (ex.: "res.partner"). */
  model: string;
  /** Lista de ids afetados. */
  ids: number[];
  /** Tipo da operação que gerou o evento. */
  operation: "create" | "update" | "delete";
  /**
   * Snapshot dos dados do registro pós-mutação, fornecido pela tool MCP.
   * Quando presente, evita um RPC extra ao Odoo , é usado diretamente no upsert.
   */
  snapshotAfter?: object;
  /** requestId da requisição MCP que originou o job (rastreabilidade). */
  requestId: string;
  /** Id da API Key que autorizou a operação. */
  apiKeyId: string;
}

// BullMQ >= 5 nao aceita ":" em queue name (Redis usa ":" como separador).
// Antes era "odoo-sync:directed"; renomeado para nao quebrar new Queue().
const QUEUE_NAME = "odoo-sync-directed";

let _queue: Queue<DirectedSyncJob> | null = null;

/**
 * Retorna (ou inicializa) a fila de sync direcionado.
 * Singleton por processo , reutiliza a conexão Redis.
 */
export function getDirectedSyncQueue(): Queue<DirectedSyncJob> {
  if (_queue) return _queue;
  _queue = new Queue<DirectedSyncJob>(QUEUE_NAME, {
    connection: new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    }),
  });
  return _queue;
}

export { QUEUE_NAME as DIRECTED_SYNC_QUEUE_NAME };
