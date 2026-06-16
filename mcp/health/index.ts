// mcp/health/index.ts
// Wiring do health check com dependências reais.
// Exporta `handleHealthRequest` pronto para ser montado no servidor HTTP.

import * as http from "node:http";
import { execSync } from "node:child_process";
import { buildHealthHandler } from "./handler.js";
import { prisma } from "../lib/prisma.js";
import { mcpRedis } from "../lib/redis.js";
import { getDirectedSyncQueue } from "../sync/queue.js";

/** Lê o SHA do commit do processo atual (curto, 7 chars). */
function readCommit(): string {
  const fromEnv = process.env.GIT_COMMIT ?? process.env.COMMIT_SHA;
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8", timeout: 2000 }).trim();
  } catch {
    return "unknown";
  }
}

const commit = readCommit();

/** Autentica no Odoo com timeout de 3 s. null quando variáveis ausentes. */
function makeOdooAuthenticate(): (() => Promise<number>) | null {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const user = process.env.ODOO_USER;
  const password = process.env.ODOO_PASSWORD;

  if (!url || !db || !user || !password) return null;

  return async () => {
    // Importação dinâmica para evitar dependência circular no servidor
    const { OdooClient } = await import("@/worker/odoo/client.js");
    const client = new OdooClient({ url, db, username: user, password });
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 3000);
    try {
      const uid = await client.authenticate();
      return uid;
    } finally {
      clearTimeout(timer);
    }
  };
}

const healthCheck = buildHealthHandler({
  queryRaw: () => prisma.$queryRaw`SELECT 1`,
  redisPing: () => mcpRedis.ping(),
  odooAuthenticate: makeOdooAuthenticate(),
  getQueueCounts: async () => {
    const counts = await getDirectedSyncQueue().getJobCounts("active", "waiting", "delayed", "failed", "completed");
    return {
      active: counts["active"] ?? 0,
      waiting: counts["waiting"] ?? 0,
      delayed: counts["delayed"] ?? 0,
      failed: counts["failed"] ?? 0,
      completed: counts["completed"] ?? 0,
    };
  },
  getCacheFreshnessSeconds: async () => {
    // Liveness do WORKER: ha quanto tempo rodou o ultimo ciclo de sync (qualquer
    // modelo), via syncState.updatedAt (tocado a cada ciclo, mesmo sem delta).
    // Antes media MAX(rawResPartner.syncedAt), que so avanca quando ALGUM parceiro
    // muda no Odoo , em horario de baixa atividade (madrugada) isso nao acontece,
    // o freshness subia indefinidamente e o health marcava "degraded" com o worker
    // 100% saudavel (falso positivo). Validado no cache real (2026-06-15):
    // rawResPartner.syncedAt ~52min parado vs syncState.updatedAt ~2min.
    const result = await prisma.syncState.aggregate({ _max: { updatedAt: true } });
    const maxDate = result._max?.updatedAt;
    if (!maxDate) return 999999;
    return Math.floor((Date.now() - maxDate.getTime()) / 1000);
  },
  getCommit: () => commit,
});

/**
 * Handler HTTP para GET /health (ou /api/mcp/health).
 * Montado no servidor ANTES do roteamento do transport MCP.
 */
export async function handleHealthRequest(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  try {
    const result = await healthCheck();
    const statusCode = result.status === "healthy" ? 200 : result.status === "degraded" ? 200 : 503;
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result, null, 2));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "unhealthy", error: String(err) }));
  }
}
