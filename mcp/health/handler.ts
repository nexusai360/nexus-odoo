// mcp/health/handler.ts
// Handler do endpoint GET /health do servidor MCP.
// Spec §25 — health check com postgres, redis, odoo, queue depth, cache freshness.

export interface HealthChecks {
  postgres: "ok" | "fail";
  redis: "ok" | "fail";
  odoo_read: "ok" | "fail" | "skip";
  odoo_write: "ok" | "fail" | "skip";
  worker_queue_depth: number;
  sync_directed_lag_ms: number;
  cache_freshness_seconds: number;
}

export interface HealthResult {
  status: "healthy" | "degraded" | "unhealthy";
  checks: HealthChecks;
  version: string;
  commit: string;
  protocol_version: string;
  timestamp: string;
}

export interface QueueCounts {
  active: number;
  waiting: number;
  delayed: number;
  failed: number;
  completed: number;
}

/** Dependências injetáveis para facilitar testes unitários. */
export interface HealthDeps {
  /** Executa `SELECT 1` no Postgres (pode rejeitar em falha). */
  queryRaw: () => Promise<unknown>;
  /** Executa PING no Redis. */
  redisPing: () => Promise<string>;
  /** Autentica no Odoo com timeout curto. null = variáveis de ambiente ausentes (skip). */
  odooAuthenticate: (() => Promise<number>) | null;
  /** Retorna contagens de jobs da fila directed sync. */
  getQueueCounts: () => Promise<QueueCounts>;
  /** Retorna freshness do cache em segundos (segundos desde o último updatedAt de rawResPartner). */
  getCacheFreshnessSeconds: () => Promise<number>;
  /** Retorna o SHA do commit atual (curto, de env ou "unknown"). */
  getCommit: () => string;
}

const VERSION = "0.1.0";
const PROTOCOL_VERSION = "2025-06-18";

/**
 * Cria o handler de health check com as dependências fornecidas.
 * Isolado de I/O real para facilitar testes unitários.
 */
export function buildHealthHandler(deps: HealthDeps): () => Promise<HealthResult> {
  return async function healthCheck(): Promise<HealthResult> {
    const [
      postgresResult,
      redisResult,
      odooResult,
      queueCounts,
      freshnessSeconds,
    ] = await Promise.allSettled([
      deps.queryRaw(),
      deps.redisPing(),
      deps.odooAuthenticate ? deps.odooAuthenticate() : Promise.resolve(null),
      deps.getQueueCounts(),
      deps.getCacheFreshnessSeconds(),
    ]);

    const postgres: "ok" | "fail" = postgresResult.status === "fulfilled" ? "ok" : "fail";
    const redis: "ok" | "fail" = redisResult.status === "fulfilled" ? "ok" : "fail";

    const odooSkip = deps.odooAuthenticate === null;
    let odooRead: "ok" | "fail" | "skip";
    let odooWrite: "ok" | "fail" | "skip";
    if (odooSkip) {
      odooRead = "skip";
      odooWrite = "skip";
    } else if (odooResult.status === "fulfilled" && odooResult.value !== null) {
      odooRead = "ok";
      odooWrite = "ok";
    } else {
      odooRead = "fail";
      odooWrite = "fail";
    }

    const counts: QueueCounts =
      queueCounts.status === "fulfilled"
        ? queueCounts.value
        : { active: 0, waiting: 0, delayed: 0, failed: 0, completed: 0 };

    // depth = jobs pendentes (não contar completed/failed)
    const workerQueueDepth = counts.active + counts.waiting + counts.delayed;

    const freshness: number =
      freshnessSeconds.status === "fulfilled" ? freshnessSeconds.value : 999999;

    // lag = 0 (não temos timestamp de enqueue disponível sem instrumentação extra)
    const syncDirectedLagMs = 0;

    const checks: HealthChecks = {
      postgres,
      redis,
      odoo_read: odooRead,
      odoo_write: odooWrite,
      worker_queue_depth: workerQueueDepth,
      sync_directed_lag_ms: syncDirectedLagMs,
      cache_freshness_seconds: freshness,
    };

    // Status geral:
    // unhealthy: postgres ou redis fail OU freshness > 3600
    // degraded:  algum check fail OU freshness 600–3600
    // healthy:   todos ok e freshness < 600
    let status: "healthy" | "degraded" | "unhealthy";

    if (postgres === "fail" || redis === "fail" || freshness > 3600) {
      status = "unhealthy";
    } else if (odooRead === "fail" || odooWrite === "fail" || freshness >= 600) {
      status = "degraded";
    } else {
      status = "healthy";
    }

    return {
      status,
      checks,
      version: VERSION,
      commit: deps.getCommit(),
      protocol_version: PROTOCOL_VERSION,
      timestamp: new Date().toISOString(),
    };
  };
}
