import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "./prisma";
import { clientFromEnv } from "./odoo/client";
import { MODEL_CATALOG } from "./catalog/model-catalog";
import { readSyncConfig } from "./sync/sync-config";
import {
  processIncrementalCycle,
  processSnapshotCycle,
  processReconcileCycle,
} from "./sync/processors";
import { JOB_INCREMENTAL, JOB_SNAPSHOT, JOB_RECONCILE, JOB_CONFIG_CHECK } from "./jobs";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
connection.on("error", (err: Error) => console.error("[worker] erro Redis:", err.message));

export const ODOO_SYNC_QUEUE = "odoo-sync";
export const syncQueue = new Queue(ODOO_SYNC_QUEUE, { connection });

// Guarda de sobreposição: um ciclo em andamento bloqueia outro do mesmo tipo.
const emAndamento = new Set<string>();

/**
 * (Re)agenda os três ciclos de sync com os intervalos atuais da config.
 * upsertJobScheduler é idempotente — chamar de novo com outro `every`
 * reajusta o agendamento. É o que faz a mudança na tela /configuracao
 * valer sem reiniciar o worker.
 */
async function aplicarAgendamento(): Promise<void> {
  const cfg = await readSyncConfig(prisma);
  await syncQueue.upsertJobScheduler(
    JOB_INCREMENTAL,
    { every: cfg.incrementalIntervalMin * 60_000 },
    { name: JOB_INCREMENTAL },
  );
  await syncQueue.upsertJobScheduler(
    JOB_SNAPSHOT,
    { every: cfg.snapshotIntervalMin * 60_000 },
    { name: JOB_SNAPSHOT },
  );
  await syncQueue.upsertJobScheduler(
    JOB_RECONCILE,
    { every: cfg.reconcileIntervalMin * 60_000 },
    { name: JOB_RECONCILE },
  );
  console.log(
    `[worker] agendado — incremental ${cfg.incrementalIntervalMin}min, ` +
      `snapshot ${cfg.snapshotIntervalMin}min, reconcile ${cfg.reconcileIntervalMin}min`,
  );
}

async function rodarCiclo(name: string): Promise<void> {
  const client = clientFromEnv();
  await client.authenticate();
  const ctx = { prisma, client };
  if (name === JOB_INCREMENTAL) await processIncrementalCycle(ctx, MODEL_CATALOG);
  else if (name === JOB_SNAPSHOT) await processSnapshotCycle(ctx, MODEL_CATALOG);
  else if (name === JOB_RECONCILE) await processReconcileCycle(ctx, MODEL_CATALOG);
}

const worker = new Worker(
  ODOO_SYNC_QUEUE,
  async (job: Job) => {
    // O job de config-check relê a config e reaplica os intervalos.
    if (job.name === JOB_CONFIG_CHECK) {
      await aplicarAgendamento();
      return { ok: true };
    }
    if (emAndamento.has(job.name)) {
      console.log(`[worker] ciclo "${job.name}" ainda rodando — pulado`);
      return { skipped: true };
    }
    emAndamento.add(job.name);
    const inicio = Date.now();
    try {
      await rodarCiclo(job.name);
      console.log(`[worker] ciclo "${job.name}" concluído em ${Date.now() - inicio}ms`);
      return { ok: true };
    } finally {
      emAndamento.delete(job.name);
    }
  },
  { connection, concurrency: 1 },
);

worker.on("ready", () => console.log(`[worker] pronto — fila "${ODOO_SYNC_QUEUE}"`));
worker.on("failed", (job, err) => console.error(`[worker] job ${job?.id} falhou:`, err));
worker.on("error", (err) => console.error("[worker] erro:", err));

async function bootstrap(): Promise<void> {
  await aplicarAgendamento();
  // config-check a cada 1 min: detecta mudança de intervalo feita na tela.
  await syncQueue.upsertJobScheduler(
    JOB_CONFIG_CHECK,
    { every: 60_000 },
    { name: JOB_CONFIG_CHECK },
  );
}

bootstrap().catch((err) => console.error("[worker] falha no bootstrap:", err));
console.log("[worker] nexus-odoo worker iniciado");

async function shutdown() {
  console.log("[worker] encerrando…");
  await worker.close();
  await syncQueue.close();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
