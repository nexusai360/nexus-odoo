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
import { AGENT_QUEUE_NAME } from "./agent/queue";
import { processAgentJob, type AgentJobData } from "./agent/processor";
import { cleanupIdempotencyTable } from "./agent/cleanup";
import {
  AGENT_TOPIC_TAGGING_QUEUE,
  type TopicTaggingJobData,
} from "./agent-intelligence/queue";
import { processTopicTaggingJob } from "./agent-intelligence/topic-tagging";
import { refreshUsdBrlRateFromBCB } from "@/lib/agent/llm/exchange-rate";
import {
  clearPending,
  isOdooUnavailable,
  markPending,
  readPending,
} from "./recovery";
import {
  processDirectedSync,
  type DirectedSyncDeps,
} from "./sync/directed";
import { DIRECTED_SYNC_QUEUE_NAME } from "../../mcp/sync/queue";
import type { DirectedSyncJob } from "../../mcp/sync/queue";
import { cleanupExpiredIdempotency } from "./cleanup/idempotency";
import { cleanupAuditLog } from "./cleanup/audit-log";

export const MAINTENANCE_QUEUE = "maintenance";
export const JOB_CLEANUP_IDEMPOTENCY = "cleanup-idempotency";
export const JOB_CLEANUP_MCP_IDEMPOTENCY = "cleanup-mcp-idempotency";
export const JOB_CLEANUP_AUDIT_LOG = "cleanup-audit-log";
export const JOB_REFRESH_USD_BRL = "refresh-usd-brl-ptax";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
connection.on("error", (err: Error) => console.error("[worker] erro Redis:", err.message));

export const ODOO_SYNC_QUEUE = "odoo-sync";
export const syncQueue = new Queue(ODOO_SYNC_QUEUE, { connection });

// ─── Fila do agente ───────────────────────────────────────────────────────────
export const agentQueue = new Queue(AGENT_QUEUE_NAME, { connection });

const agentWorker = new Worker(
  AGENT_QUEUE_NAME,
  async (job: Job<AgentJobData>) => {
    console.log(`[agent-worker] processando job ${job.id} (messageId: ${job.data.messageId})`);
    await processAgentJob(job.data);
    return { ok: true };
  },
  { connection, concurrency: 3 },
);

agentWorker.on("ready", () => console.log(`[agent-worker] pronto , fila "${AGENT_QUEUE_NAME}"`));
agentWorker.on("failed", (job, err) =>
  console.error(`[agent-worker] job ${job?.id} falhou:`, err),
);
agentWorker.on("error", (err) => console.error("[agent-worker] erro:", err));

// ─── Fila da inteligencia: topic-tagging (Onda 1 F4.5) ────────────────────────
export const agentTopicTaggingQueue = new Queue(AGENT_TOPIC_TAGGING_QUEUE, { connection });

const agentTopicTaggingWorker = new Worker(
  AGENT_TOPIC_TAGGING_QUEUE,
  async (job: Job<TopicTaggingJobData>) => {
    return processTopicTaggingJob(job.data);
  },
  { connection, concurrency: 2 },
);

agentTopicTaggingWorker.on("ready", () =>
  console.log(`[agent-topic-tagging-worker] pronto , fila "${AGENT_TOPIC_TAGGING_QUEUE}"`),
);
agentTopicTaggingWorker.on("failed", (job, err) =>
  console.error(`[agent-topic-tagging-worker] job ${job?.id} falhou:`, err),
);
agentTopicTaggingWorker.on("error", (err) =>
  console.error("[agent-topic-tagging-worker] erro:", err),
);

// ─── Fila de manutenção (cron diário) ─────────────────────────────────────────
export const maintenanceQueue = new Queue(MAINTENANCE_QUEUE, { connection });

const maintenanceWorker = new Worker(
  MAINTENANCE_QUEUE,
  async (job: Job) => {
    if (job.name === JOB_CLEANUP_IDEMPOTENCY) {
      const result = await cleanupIdempotencyTable();
      console.log(`[maintenance] cleanup idempotência: ${result.deleted} registros removidos`);
      return result;
    }
    if (job.name === JOB_CLEANUP_MCP_IDEMPOTENCY) {
      const result = await cleanupExpiredIdempotency(prisma);
      console.log(
        `[maintenance] cleanup McpIdempotencyRecord: ${result.deleted} registros removidos`,
      );
      return result;
    }
    if (job.name === JOB_REFRESH_USD_BRL) {
      try {
        const rate = await refreshUsdBrlRateFromBCB();
        console.log(
          `[maintenance] PTAX USD/BRL atualizada: ` +
            `commercial=${rate.commercial.toFixed(4)} effective=${rate.rate.toFixed(4)}`,
        );
        return { ok: true, commercial: rate.commercial };
      } catch (err) {
        console.error("[maintenance] falha ao atualizar PTAX:", err);
        return { ok: false, error: (err as Error).message };
      }
    }
    if (job.name === JOB_CLEANUP_AUDIT_LOG) {
      const result = await cleanupAuditLog(prisma);
      console.log(
        `[maintenance] cleanup McpAuditLog: ${result.nullified} nullificados, ` +
          `${result.deleted} deletados`,
      );
      return result;
    }
    return { ok: true };
  },
  { connection, concurrency: 1 },
);

maintenanceWorker.on("ready", () =>
  console.log(`[maintenance-worker] pronto , fila "${MAINTENANCE_QUEUE}"`),
);
maintenanceWorker.on("error", (err) => console.error("[maintenance-worker] erro:", err));

// ─── Worker de sync direcionado (H3) ──────────────────────────────────────────
// Processa jobs disparados pelas tools MCP após mutações (create/update/delete).
// Usa a mesma conexão Redis compartilhada; concorrência 5 para processar
// bursts de sync sem bloquear o cron incremental.
const directedDeps: DirectedSyncDeps = {
  prisma,
  odoo: clientFromEnv(),
  redis: connection,
};

export const directedSyncQueue = new Queue<DirectedSyncJob>(DIRECTED_SYNC_QUEUE_NAME, {
  connection,
});

const directedSyncWorker = new Worker<DirectedSyncJob>(
  DIRECTED_SYNC_QUEUE_NAME,
  async (job: Job<DirectedSyncJob>) => {
    return processDirectedSync(job, directedDeps);
  },
  { connection, concurrency: 5 },
);

directedSyncWorker.on("ready", () =>
  console.log(`[directed-sync-worker] pronto , fila "${DIRECTED_SYNC_QUEUE_NAME}"`),
);
directedSyncWorker.on("failed", (job, err) =>
  console.error(`[directed-sync-worker] job ${job?.id} falhou:`, err),
);
directedSyncWorker.on("error", (err) => console.error("[directed-sync-worker] erro:", err));

// Guarda de sobreposição cluster-safe: lock no Redis com TTL (WR-01). Sobrevive
// a restart e protege contra uma segunda réplica do worker rodando o mesmo
// ciclo. Reduzido de 2h para 15min: 2h mascarava lock zumbi (incremental
// que travasse sem liberar prendia a fila por ate 2h). 15min eh folgado
// pra ciclo honesto (incremental leva segundos; snapshot 1-2min), mas se
// algo travar, o lock expira sozinho e a fila destrava sem intervencao.
const LOCK_TTL_MS = 15 * 60 * 1000;
const lockKey = (jobName: string) => `odoo-sync:lock:${jobName}`;

/** Tenta adquirir o lock do ciclo. Retorna true se conseguiu. */
async function adquirirLock(jobName: string): Promise<boolean> {
  const res = await connection.set(lockKey(jobName), String(Date.now()), "PX", LOCK_TTL_MS, "NX");
  return res === "OK";
}

/** Libera o lock do ciclo. */
async function liberarLock(jobName: string): Promise<void> {
  await connection.del(lockKey(jobName));
}

// Cache da última config aplicada , evita churn de upsertJobScheduler (WR-04).
let ultimaConfigAplicada: Awaited<ReturnType<typeof readSyncConfig>> | null = null;

/**
 * (Re)agenda os três ciclos de sync com os intervalos atuais da config.
 * upsertJobScheduler é idempotente , chamar de novo com outro `every`
 * reajusta o agendamento. É o que faz a mudança na tela /configuracao
 * valer sem reiniciar o worker. Só reagenda quando algum valor mudou.
 */
async function aplicarAgendamento(): Promise<void> {
  const cfg = await readSyncConfig(prisma);
  if (
    ultimaConfigAplicada &&
    ultimaConfigAplicada.incrementalIntervalMin === cfg.incrementalIntervalMin &&
    ultimaConfigAplicada.snapshotIntervalMin === cfg.snapshotIntervalMin &&
    ultimaConfigAplicada.reconcileIntervalMin === cfg.reconcileIntervalMin
  ) {
    return; // nada mudou , não reagenda (WR-04)
  }
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
  ultimaConfigAplicada = cfg;
  console.log(
    `[worker] agendado , incremental ${cfg.incrementalIntervalMin}min, ` +
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

/**
 * Drena snapshot/reconcile pendentes após uma recuperação.
 *
 * Chamado somente após um JOB_INCREMENTAL bem-sucedido , esse é o "sinal
 * vital" de que o Tauga voltou. Enfileira os jobs marcados como pendentes
 * com prioridade alta e limpa o flag. O resto do agendamento normal
 * (snapshot 30min / reconcile 1440min) continua intacto.
 */
async function drenarPendentes(): Promise<void> {
  const pending = await readPending(connection);
  if (!pending.snapshot && !pending.reconcile) return;

  if (pending.snapshot) {
    await syncQueue.add(JOB_SNAPSHOT, { kind: JOB_SNAPSHOT }, { priority: 1 });
    await clearPending(connection, "snapshot");
    console.log(
      "[worker] recovery , snapshot pendente enfileirado após Tauga voltar",
    );
  }
  if (pending.reconcile) {
    await syncQueue.add(JOB_RECONCILE, { kind: JOB_RECONCILE }, { priority: 1 });
    await clearPending(connection, "reconcile");
    console.log(
      "[worker] recovery , reconcile pendente enfileirado após Tauga voltar",
    );
  }
}

const worker = new Worker(
  ODOO_SYNC_QUEUE,
  async (job: Job) => {
    // O job de config-check relê a config e reaplica os intervalos.
    if (job.name === JOB_CONFIG_CHECK) {
      await aplicarAgendamento();
      return { ok: true };
    }
    // Lock cluster-safe: se outro worker/ciclo já o detém, pula (WR-01).
    if (!(await adquirirLock(job.name))) {
      console.log(`[worker] ciclo "${job.name}" ainda rodando (lock) , pulado`);
      return { skipped: true };
    }
    const inicio = Date.now();
    try {
      await rodarCiclo(job.name);
      console.log(`[worker] ciclo "${job.name}" concluído em ${Date.now() - inicio}ms`);
      // Self-healing: incremental bem-sucedido = Tauga vivo → drena pendentes.
      if (job.name === JOB_INCREMENTAL) {
        await drenarPendentes().catch((err) =>
          console.error("[worker] falha ao drenar pendentes:", err),
        );
      }
      return { ok: true };
    } catch (err) {
      // Indisponibilidade do Tauga: snapshot/reconcile ficam "pendentes" para
      // o próximo incremental bem-sucedido enfileirar imediatamente. Para o
      // incremental, basta deixar o BullMQ tentar de novo no próximo ciclo
      // (3min) , não precisa marcar nada.
      if (
        isOdooUnavailable(err) &&
        (job.name === JOB_SNAPSHOT || job.name === JOB_RECONCILE)
      ) {
        await markPending(
          connection,
          job.name === JOB_SNAPSHOT ? "snapshot" : "reconcile",
        );
        console.warn(
          `[worker] Odoo indisponível durante ciclo "${job.name}" , ` +
            `marcado como pendente; será rodado quando o incremental voltar.`,
        );
        // Retorna ok para o BullMQ não fazer retry exponencial agressivo
        // (o incremental já é o nosso health check).
        return { ok: false, pendingRecovery: true };
      }
      throw err;
    } finally {
      await liberarLock(job.name);
    }
  },
  { connection, concurrency: 1 },
);

worker.on("ready", () => console.log(`[worker] pronto , fila "${ODOO_SYNC_QUEUE}"`));
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
  // Limpeza diária da tabela de idempotência (ProcessedWhatsappMessage > 7 dias).
  await maintenanceQueue.upsertJobScheduler(
    JOB_CLEANUP_IDEMPOTENCY,
    { every: 24 * 60 * 60_000 }, // 24h em ms
    { name: JOB_CLEANUP_IDEMPOTENCY },
  );
  console.log("[worker] cron de limpeza de idempotência agendado (24h)");

  // Limpeza horária do McpIdempotencyRecord (registros com expiresAt expirado).
  await maintenanceQueue.upsertJobScheduler(
    JOB_CLEANUP_MCP_IDEMPOTENCY,
    { every: 60 * 60_000 }, // 1h em ms
    { name: JOB_CLEANUP_MCP_IDEMPOTENCY },
  );
  console.log("[worker] cron de limpeza de McpIdempotencyRecord agendado (1h)");

  // Limpeza diária do McpAuditLog às 01:00 BRT (UTC-3 → 04:00 UTC).
  // pattern cron: "0 4 * * *"
  await maintenanceQueue.upsertJobScheduler(
    JOB_CLEANUP_AUDIT_LOG,
    { pattern: "0 4 * * *" },
    { name: JOB_CLEANUP_AUDIT_LOG },
  );
  console.log("[worker] cron de limpeza de McpAuditLog agendado (diário 01:00 BRT)");

  // Refresh da PTAX USD/BRL todo dia util as 18:30 BRT (21:30 UTC).
  // BCB publica PTAX de fechamento ~ 13:10 BRT, mas damos folga para
  // garantir que a serie 10813 esteja com o valor do dia.
  // Tambem dispara uma execucao imediata no boot para preencher o Redis.
  await maintenanceQueue.upsertJobScheduler(
    JOB_REFRESH_USD_BRL,
    { pattern: "30 21 * * 1-5" },
    { name: JOB_REFRESH_USD_BRL },
  );
  await maintenanceQueue.add(JOB_REFRESH_USD_BRL, {});
  console.log("[worker] cron de PTAX USD/BRL agendado (diário 18:30 BRT) + refresh inicial");
}

bootstrap().catch((err) => console.error("[worker] falha no bootstrap:", err));
console.log("[worker] nexus-odoo worker iniciado");

async function shutdown() {
  console.log("[worker] encerrando…");
  await worker.close();
  await agentWorker.close();
  await maintenanceWorker.close();
  await directedSyncWorker.close();
  await syncQueue.close();
  await agentQueue.close();
  await maintenanceQueue.close();
  await directedSyncQueue.close();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
