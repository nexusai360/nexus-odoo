import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// BullMQ exige conexão dedicada (maxRetriesPerRequest: null) — não compartilha
// o singleton de src/lib/redis.ts.
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
connection.on("error", (err: Error) => {
  console.error("[worker] erro de conexão Redis:", err.message);
});

export const ODOO_SYNC_QUEUE = "odoo-sync";

// Fila de sincronização do Odoo. A Fase 2 (ingestão/cache) enfileira jobs aqui.
export const syncQueue = new Queue(ODOO_SYNC_QUEUE, { connection });

// Processador placeholder. A lógica de sincronização JSON-RPC do Odoo
// entra na Fase 2 — este scaffold apenas comprova que o container `worker`
// sobe e consome a fila.
const worker = new Worker(
  ODOO_SYNC_QUEUE,
  async (job: Job) => {
    console.log(`[worker] processando job ${job.id} (${job.name})`);
    return { ok: true };
  },
  { connection },
);

worker.on("ready", () => {
  console.log(`[worker] pronto — ouvindo a fila "${ODOO_SYNC_QUEUE}"`);
});
worker.on("failed", (job, err) => {
  console.error(`[worker] job ${job?.id} falhou:`, err);
});
worker.on("error", (err) => {
  console.error("[worker] erro:", err);
});

console.log("[worker] nexus-odoo worker iniciado");

async function shutdown() {
  console.log("[worker] encerrando…");
  await worker.close();
  await syncQueue.close();
  await connection.quit();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
