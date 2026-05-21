// src/worker/sync/directed.ts
// Processador BullMQ para jobs de sync direcionado.
//
// Coordenação com o cron incremental:
//   Antes de qualquer upsert, adquire lock Redis SET NX EX 30 na chave
//   `mcp:sync:<model>:<id>`. Se o lock não estiver disponível (cron incremental
//   está processando o mesmo registro), o job aguarda 50ms e tenta novamente
//   até 3x antes de prosseguir mesmo assim (best-effort, não é bloqueio fatal).
//
// Escopo POC (Onda 0): apenas res.partner → rawResPartner.
// Outros modelos resultam em log warn e no-op (serão adicionados em ondas futuras).

import type { Job } from "bullmq";
import type IORedis from "ioredis";
import type { PrismaClient } from "@/generated/prisma/client";
import type { OdooClient } from "../odoo/client";
import { getModelFields } from "../odoo/field-selection";
import { logger } from "../../../mcp/lib/logger";
import type { DirectedSyncJob } from "../../../mcp/sync/queue";

/** Chave de lock Redis para coordenação por registro. */
export function lockKey(model: string, id: number): string {
  return `mcp:sync:${model}:${id}`;
}

/** TTL do lock em segundos — curto para não bloquear o cron incremental. */
const LOCK_TTL_SEC = 30;
/** Intervalo de espera entre tentativas de lock (ms). */
const LOCK_RETRY_DELAY_MS = 50;
/** Número máximo de tentativas de lock. */
const LOCK_MAX_RETRIES = 3;

/**
 * Tenta adquirir o lock Redis para um registro.
 * Retorna true se conseguiu, false se expirou sem lock (continua best-effort).
 */
async function acquireLock(redis: IORedis, model: string, id: number): Promise<boolean> {
  const key = lockKey(model, id);
  for (let i = 0; i < LOCK_MAX_RETRIES; i++) {
    const res = await redis.set(key, "1", "EX", LOCK_TTL_SEC, "NX");
    if (res === "OK") return true;
    // Lock não adquirido — aguarda antes de tentar novamente
    await new Promise<void>((r) => setTimeout(r, LOCK_RETRY_DELAY_MS));
  }
  return false;
}

/** Libera o lock Redis para um registro. */
async function releaseLock(redis: IORedis, model: string, id: number): Promise<void> {
  await redis.del(lockKey(model, id));
}

/**
 * Processa um job de sync direcionado para `res.partner`.
 * - create/update: upsert em rawResPartner usando snapshotAfter ou fallback Odoo.read.
 * - delete: soft-delete (rawDeleted = true) em rawResPartner.
 */
async function processResPartner(
  job: DirectedSyncJob,
  prisma: PrismaClient,
  odoo: OdooClient,
  redis: IORedis,
): Promise<void> {
  const { ids, operation, snapshotAfter } = job;

  if (operation === "delete") {
    for (const id of ids) {
      const acquired = await acquireLock(redis, job.model, id);
      if (!acquired) {
        logger.warn(
          { model: job.model, id, requestId: job.requestId },
          "[directed-sync] lock não adquirido para delete — prosseguindo best-effort",
        );
      }
      try {
        await prisma.rawResPartner.update({
          where: { odooId: id },
          data: { rawDeleted: true, syncedAt: new Date() },
        });
        logger.info(
          { model: job.model, id, requestId: job.requestId },
          "[directed-sync] soft-delete aplicado",
        );
      } catch (err: unknown) {
        // Registro pode não existir no cache — ignora graciosamente
        const code = (err as { code?: string })?.code;
        if (code === "P2025") {
          logger.warn(
            { model: job.model, id, requestId: job.requestId },
            "[directed-sync] registro não encontrado para delete — ignorado",
          );
        } else {
          throw err;
        }
      } finally {
        if (acquired) await releaseLock(redis, job.model, id);
      }
    }
    return;
  }

  // create ou update: resolve os dados de cada id
  for (const id of ids) {
    const acquired = await acquireLock(redis, job.model, id);
    if (!acquired) {
      logger.warn(
        { model: job.model, id, requestId: job.requestId },
        "[directed-sync] lock não adquirido para upsert — prosseguindo best-effort",
      );
    }
    try {
      let data: object;

      if (snapshotAfter && ids.length === 1) {
        // Snapshot fornecido diretamente pela tool — evita RPC ao Odoo
        data = snapshotAfter;
      } else {
        // Fallback: lê os campos do registro no Odoo
        const fields = await getModelFields(odoo, job.model);
        const records = await odoo.read(job.model, [id], fields);
        if (!records.length) {
          logger.warn(
            { model: job.model, id, requestId: job.requestId },
            "[directed-sync] registro não retornado pelo Odoo — pulando",
          );
          continue;
        }
        data = records[0] as object;
      }

      const dataObj = data as Record<string, unknown>;
      const writeDate = typeof dataObj["write_date"] === "string"
        ? new Date(dataObj["write_date"] as string)
        : null;

      await prisma.rawResPartner.upsert({
        where: { odooId: id },
        create: {
          odooId: id,
          data,
          odooWriteDate: writeDate,
          syncedAt: new Date(),
        },
        update: {
          data,
          odooWriteDate: writeDate,
          syncedAt: new Date(),
          rawDeleted: false,
        },
      });

      logger.info(
        { model: job.model, id, operation, requestId: job.requestId },
        "[directed-sync] upsert aplicado",
      );
    } finally {
      if (acquired) await releaseLock(redis, job.model, id);
    }
  }
}

/** Dependências injetadas no processador. */
export interface DirectedSyncDeps {
  prisma: PrismaClient;
  odoo: OdooClient;
  redis: IORedis;
}

/**
 * Processador BullMQ da fila `odoo-sync:directed`.
 * Exportado para ser registrado em `src/worker/index.ts`.
 */
export async function processDirectedSync(
  job: Job<DirectedSyncJob>,
  deps: DirectedSyncDeps,
): Promise<{ ok: boolean; processed?: number }> {
  const { model, ids, operation, requestId } = job.data;

  logger.info(
    { model, ids, operation, requestId, jobId: job.id },
    "[directed-sync] iniciando job",
  );

  if (model === "res.partner") {
    await processResPartner(job.data, deps.prisma, deps.odoo, deps.redis);
    return { ok: true, processed: ids.length };
  }


  // Modelos não suportados nesta onda — no-op com aviso
  logger.warn(
    { model, requestId, jobId: job.id },
    "[directed-sync] modelo não suportado nesta onda — job ignorado",
  );
  return { ok: true, processed: 0 };
}
