import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "./prisma";
import { clientFromEnv } from "./odoo/client";

import { MODEL_CATALOG } from "./catalog/model-catalog";
import { readSyncConfig } from "./sync/sync-config";
import { criarCicloLock } from "./sync/ciclo-lock";
import {
  processIncrementalCycle,
  processSnapshotCycle,
  processReconcileCycle,
} from "./sync/processors";
import {
  JOB_INCREMENTAL,
  JOB_SNAPSHOT,
  JOB_RECONCILE,
  JOB_CONFIG_CHECK,
  JOB_ONDEMAND,
  ODOO_SYNC_QUEUE_NAME,
} from "./jobs";
import { escoparCatalogo } from "./sync/ondemand-cycle";
import { AGENT_QUEUE_NAME } from "./agent/queue";
import { processAgentJob, type AgentJobData } from "./agent/processor";
import { cleanupIdempotencyTable } from "./agent/cleanup";
import {
  AGENT_TOPIC_TAGGING_QUEUE,
  AGENT_RESUMO_CONVERSA_QUEUE,
  type TopicTaggingJobData,
  type ResumoConversaJobData,
} from "./agent-intelligence/queue";
import { processTopicTaggingJob } from "./agent-intelligence/topic-tagging";
import { processResumoConversaJob } from "./agent-intelligence/resumo-conversa";
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
import { capturarSnapshotEstoqueDiario } from "./fatos/snapshot-estoque-diario";
import { rebuildFatoEstoqueLocal } from "./fatos/fato-estoque-local";
import { rebuildFatoPedidoItem } from "./fatos/fato-pedido-item";
import { markFatoBuilt } from "./fatos/fato-build-state";
import { syncAtendimento } from "./sync/atendimento";
import { CHAVE_BUILD_ATENDIMENTO } from "../lib/diretoria/atendimento-status";

import { rodarProfileAggregate } from "./agent-intelligence/profile-aggregate";

export const MAINTENANCE_QUEUE = "maintenance";
export const JOB_CLEANUP_IDEMPOTENCY = "cleanup-idempotency";
export const JOB_CLEANUP_MCP_IDEMPOTENCY = "cleanup-mcp-idempotency";
export const JOB_CLEANUP_AUDIT_LOG = "cleanup-audit-log";
export const JOB_REFRESH_USD_BRL = "refresh-usd-brl-ptax";
export const JOB_SNAPSHOT_ESTOQUE = "snapshot-estoque-diario";
/** Classifica os locais de estoque (fisico | demonstracao | fora). Roda no boot. */
export const JOB_CLASSIFICACAO_LOCAIS = "classificacao-locais";
/** Relê do Odoo o quanto de cada pedido ainda falta entregar. Diário. */
export const JOB_ATENDIMENTO = "atendimento-pedidos";

/** O job de atendimento leva de 4 a 8 min. 15 min é o teto antes de considerá-lo travado. */
const ATENDIMENTO_TIMEOUT_MS = 15 * 60_000;
/** Se o ciclo de sync estiver rodando, tenta de novo daqui a pouco (não pula o dia). */
const ATENDIMENTO_RETRY_MS = 15 * 60_000;
export const JOB_PROFILE_AGGREGATE = "profile-aggregate";
/** Cadencia do perfil deterministico por usuario (camada deterministica, roda em prod). */
const PROFILE_AGGREGATE_EVERY_MS = 60 * 60_000; // 1h
// Nome do scheduler legado da heurística (ARRANCADA): mantido só como literal
// pra purgar qualquer job repetível antigo que ainda esteja no Redis.
const LEGACY_JOB_AUTO_HEURISTIC = "quality-auto-heuristic";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
connection.on("error", (err: Error) => console.error("[worker] erro Redis:", err.message));

// Fonte única do nome da fila (compartilhada com jobs.ts e o acessor lazy do app).
export const ODOO_SYNC_QUEUE = ODOO_SYNC_QUEUE_NAME;
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

// ─── Fila da inteligencia: resumo progressivo da conversa (Onda M , M.5) ─────
export const agentResumoConversaQueue = new Queue(AGENT_RESUMO_CONVERSA_QUEUE, { connection });

const agentResumoConversaWorker = new Worker(
  AGENT_RESUMO_CONVERSA_QUEUE,
  async (job: Job<ResumoConversaJobData>) => {
    return processResumoConversaJob(job.data);
  },
  { connection, concurrency: 2 },
);

agentResumoConversaWorker.on("ready", () =>
  console.log(`[agent-resumo-conversa-worker] pronto , fila "${AGENT_RESUMO_CONVERSA_QUEUE}"`),
);
agentResumoConversaWorker.on("failed", (job, err) =>
  console.error(`[agent-resumo-conversa-worker] job ${job?.id} falhou:`, err),
);
agentResumoConversaWorker.on("error", (err) =>
  console.error("[agent-resumo-conversa-worker] erro:", err),
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
    if (job.name === JOB_SNAPSHOT_ESTOQUE) {
      try {
        const r = await capturarSnapshotEstoqueDiario(prisma);
        console.log(
          `[maintenance] snapshot estoque ${r.dataRef}: ${r.linhas} linhas capturadas`,
        );
        return { ok: true, ...r };
      } catch (err) {
        console.error("[maintenance] falha no snapshot de estoque:", err);
        return { ok: false, error: (err as Error).message };
      }
    }
    if (job.name === JOB_ATENDIMENTO) {
      // Escreve na mesma raw que o ciclo de sync, então pega o lock DELE (o lock é por
      // nome de job: um lock próprio não protegeria de nada). E se o ciclo estiver
      // rodando, reagenda , pular significaria mais 24h com a demanda desatualizada.
      if (!(await adquirirLock(JOB_INCREMENTAL))) {
        await maintenanceQueue.add(
          JOB_ATENDIMENTO,
          {},
          { delay: ATENDIMENTO_RETRY_MS },
        );
        console.log(
          "[maintenance] atendimento: ciclo de sync em andamento, reagendado para daqui a 15 min",
        );
        return { ok: false, reagendado: true };
      }
      try {
        const client = clientFromEnv();
        await client.authenticate();
        // O prazo vai DENTRO do job: ele checa a cada pagina e para. Um Promise.race aqui
        // desistiria da espera e liberaria o lock, mas deixaria o job rodando por baixo,
        // escrevendo na mesma tabela que o ciclo de sync que pegasse o lock em seguida.
        const r = await syncAtendimento(
          client,
          prisma.rawSpedDocumentoItem as never,
          ATENDIMENTO_TIMEOUT_MS,
        );
        await rebuildFatoPedidoItem(prisma);
        // Barreira de completude: o marcador só é gravado quando o job termina INTEIRO.
        // É ele que as consultas leem para decidir se podem confiar nas colunas de
        // atendimento. Se o job morre no meio, o marcador não vem, e a plataforma cai
        // uniformemente no valor cheio (com aviso) em vez de somar metade de cada base.
        await markFatoBuilt(prisma, CHAVE_BUILD_ATENDIMENTO);
        console.log(
          `[maintenance] atendimento: ${r.atualizados} itens em ${(r.duracaoMs / 1000).toFixed(0)}s`,
        );
        return { ok: true, ...r };
      } catch (err) {
        console.error("[maintenance] falha no atendimento:", err);
        return { ok: false, error: (err as Error).message };
      } finally {
        await liberarLock(JOB_INCREMENTAL);
      }
    }
    if (job.name === JOB_CLASSIFICACAO_LOCAIS) {
      // O app ja serve as consultas de estoque assim que sobe, e elas filtram pelos
      // locais classificados. Se esperassemos o snapshot (30 min), haveria uma janela
      // com o fato vazio. As consultas tem fail-safe (nao filtram e avisam), mas o
      // certo e ter a classificacao em segundos, nao em meia hora.
      try {
        const locais = await rebuildFatoEstoqueLocal(prisma);
        console.log(`[maintenance] classificacao de locais: ${locais} locais`);
        return { ok: true, locais };
      } catch (err) {
        console.error("[maintenance] falha ao classificar locais:", err);
        return { ok: false, error: (err as Error).message };
      }
    }
    if (job.name === JOB_PROFILE_AGGREGATE) {
      try {
        const r = await rodarProfileAggregate(prisma);
        console.log(`[maintenance] perfil de interacao: ${r.atualizados} usuarios atualizados`);
        return { ok: true, ...r };
      } catch (err) {
        console.error("[maintenance] falha no profile-aggregate:", err);
        return { ok: false, error: (err as Error).message };
      }
    }
    if (job.name === LEGACY_JOB_AUTO_HEURISTIC) {
      // Heurística ARRANCADA: a perícia é exclusivamente do Claude Code headless
      // host-side (src/lib/agent/quality/judge-scheduler.ts). Este no-op só pega
      // um job repetível legado que ainda dispare do Redis até o scheduler ser
      // purgado (aplicarPurgaHeuristicaLegado).
      console.log("[maintenance] job heurístico legado IGNORADO (arrancado)");
      return { ok: true, skipped: "heuristica-arrancada" };
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

// Guarda de sobreposição cluster-safe: lock no Redis com dono + heartbeat
// (WR-01). Protege contra uma segunda réplica do worker rodando o mesmo ciclo.
//
// Histórico: o lock era um SET NX com TTL fixo de 15 min e sem dono. Quando o
// worker morria no meio do ciclo (OOM, deploy, restart), o lock ficava para trás
// e o worker novo pulava ciclos até o TTL vencer , 15 minutos de sync parada por
// restart, destravados na mão (scripts/_prod-redis-lock.py --destravar). Agora o
// TTL é curto (90s) e quem detém o lock o renova a cada 30s; processo morto para
// de renovar e o lock cai sozinho. Ver src/worker/sync/ciclo-lock.ts.
const cicloLock = criarCicloLock(connection);
// Hard timeout do rodarCiclo: se passar disso sem retornar (ex.: chamada
// HTTP ao Tauga hangando sem timeout proprio), aborta. Com o heartbeat o lock
// acompanha o ciclo enquanto ele vive; este timeout garante que "ainda rodando"
// não vire desculpa eterna.
const CYCLE_HARD_TIMEOUT_MS = 10 * 60 * 1000;

/** Tenta adquirir o lock do ciclo. Retorna true se conseguiu. */
async function adquirirLock(jobName: string): Promise<boolean> {
  return cicloLock.adquirir(jobName);
}

/** Libera o lock do ciclo (só se ainda for nosso). */
async function liberarLock(jobName: string): Promise<void> {
  await cicloLock.liberar(jobName);
}

// Cache da última config aplicada , evita churn de upsertJobScheduler (WR-04).
let ultimaConfigAplicada: Awaited<ReturnType<typeof readSyncConfig>> | null = null;
// Flag de purga única do scheduler heurístico legado.
let heuristicaLegadoPurgada = false;

/** Remove (uma vez) o scheduler repetível legado da heurística do Redis. A
 *  perícia é exclusivamente do Claude Code host-side (judge-scheduler.ts); o
 *  worker/container não dispara `claude`. Idempotente. */
async function aplicarPurgaHeuristicaLegado(): Promise<void> {
  if (heuristicaLegadoPurgada) return;
  try {
    await maintenanceQueue.removeJobScheduler(LEGACY_JOB_AUTO_HEURISTIC);
  } catch {
    // ok se nao existir
  }
  heuristicaLegadoPurgada = true;
  console.log("[maintenance] scheduler heurístico legado purgado (arrancado)");
}

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
 * Ciclo incremental ESCOPADO aos modelos passados (sync sob demanda da Diretoria).
 * Reusa processIncrementalCycle, que aceita um catálogo pré-filtrado.
 */
async function rodarCicloEscopado(models: string[]): Promise<void> {
  const client = clientFromEnv();
  await client.authenticate();
  const ctx = { prisma, client };
  await processIncrementalCycle(ctx, escoparCatalogo(models));
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
      // Purga (uma vez) o scheduler heurístico legado, se ainda houver no Redis.
      await aplicarPurgaHeuristicaLegado();
      return { ok: true };
    }
    // Sync sob demanda (Diretoria): ciclo incremental ESCOPADO aos modelos da
    // tela. Adquire o lock do INCREMENTAL (não "ondemand") para serializar com o
    // cron e não duplicar trabalho; se ocupado, pula. One-shot: não mexe no
    // scheduler repeat. Early-branch ANTES do lock genérico de baixo.
    if (job.name === JOB_ONDEMAND) {
      const models = (job.data?.models as string[] | undefined) ?? [];
      if (models.length === 0) return { ok: true, skipped: "sem modelos" };
      if (!(await adquirirLock(JOB_INCREMENTAL))) {
        console.log("[worker] sync ondemand pulado , incremental em andamento (lock)");
        return { skipped: true };
      }
      const inicioOd = Date.now();
      try {
        await rodarCicloEscopado(models);
        console.log(
          `[worker] sync ondemand (${models.length} modelos) concluído em ${Date.now() - inicioOd}ms`,
        );
        return { ok: true };
      } finally {
        await liberarLock(JOB_INCREMENTAL);
      }
    }
    // Lock cluster-safe: se outro worker/ciclo já o detém, pula (WR-01).
    if (!(await adquirirLock(job.name))) {
      console.log(`[worker] ciclo "${job.name}" ainda rodando (lock) , pulado`);
      return { skipped: true };
    }
    const inicio = Date.now();
    try {
      // Race contra timeout duro: ciclo precisa terminar em
      // CYCLE_HARD_TIMEOUT_MS. Se hangar (ex.: HTTP ao Tauga sem
      // timeout), rejeita; o finally libera o lock pra fila destravar.
      await Promise.race([
        rodarCiclo(job.name),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `ciclo "${job.name}" excedeu hard timeout de ${CYCLE_HARD_TIMEOUT_MS / 60_000}min`,
                ),
              ),
            CYCLE_HARD_TIMEOUT_MS,
          ),
        ),
      ]);
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

  // Snapshot DIÁRIO do saldo de estoque (série histórica) , 09:00 BRT (12:00 UTC),
  // hora em que a data UTC e a BRT coincidem. Também dispara no boot para começar
  // a história imediatamente (cada dia sem captura = um dia exato perdido).
  await maintenanceQueue.upsertJobScheduler(
    JOB_SNAPSHOT_ESTOQUE,
    { pattern: "0 12 * * *" },
    { name: JOB_SNAPSHOT_ESTOQUE },
  );
  await maintenanceQueue.add(JOB_SNAPSHOT_ESTOQUE, {});
  console.log("[worker] cron de snapshot diário de estoque agendado (09:00 BRT)");

  // Classificação dos locais de estoque. O ciclo de snapshot (30 min) também a
  // reconstrói, mas disparamos no boot para que o app nunca sirva uma tela de estoque
  // sem saber quais locais são da casa.
  await maintenanceQueue.upsertJobScheduler(
    JOB_CLASSIFICACAO_LOCAIS,
    { every: 6 * 60 * 60_000 },
    { name: JOB_CLASSIFICACAO_LOCAIS },
  );
  await maintenanceQueue.add(JOB_CLASSIFICACAO_LOCAIS, {});
  console.log("[worker] classificação de locais agendada (6h) + build inicial");

  // Quanto de cada pedido ainda falta entregar. Ciclo próprio de 24h porque o campo é
  // computado no Odoo e NÃO mexe no write_date da linha , o ciclo incremental (que
  // filtra por write_date) nunca perceberia uma entrega. Roda de madrugada (04:00 BRT),
  // quando o Odoo está ocioso, e também no boot para não haver janela sem o dado.
  await maintenanceQueue.upsertJobScheduler(
    JOB_ATENDIMENTO,
    { pattern: "0 7 * * *" },
    { name: JOB_ATENDIMENTO },
  );
  await maintenanceQueue.add(JOB_ATENDIMENTO, {});
  console.log("[worker] atendimento de pedidos agendado (04:00 BRT) + pull inicial");
  console.log("[worker] cron de PTAX USD/BRL agendado (diário 18:30 BRT) + refresh inicial");

  // Perfil de interacao por usuario (camada DETERMINISTICA, SQL puro, sem claude) , roda em
  // prod a cada 1h. Tambem dispara no boot para popular os perfis ja existentes.
  await maintenanceQueue.upsertJobScheduler(
    JOB_PROFILE_AGGREGATE,
    { every: PROFILE_AGGREGATE_EVERY_MS },
    { name: JOB_PROFILE_AGGREGATE },
  );
  await maintenanceQueue.add(JOB_PROFILE_AGGREGATE, {});
  console.log("[worker] cron de perfil de interacao agendado (1h) + build inicial");

  // Heurística arrancada: purga (uma vez) qualquer scheduler legado no Redis.
  // A perícia agora é só do Claude Code host-side (judge-scheduler.ts).
  await aplicarPurgaHeuristicaLegado();
}

bootstrap().catch((err) => console.error("[worker] falha no bootstrap:", err));
console.log("[worker] nexus-odoo worker iniciado");

async function shutdown() {
  console.log("[worker] encerrando…");
  // Para os heartbeats antes de fechar a conexão do Redis (renovar em conexão
  // morta só geraria ruído). O lock em si não é apagado aqui de propósito: se um
  // ciclo estiver rodando, quem o segura é o `finally` do processor; se o processo
  // for derrubado no meio, o TTL de 90s dá conta.
  cicloLock.pararTudo();
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
