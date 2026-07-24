"use server";

import IORedis from "ioredis";

import { getCurrentUser } from "@/lib/auth";
import { canDiretoria } from "@/lib/diretoria/access";
import { JOB_ONDEMAND } from "@/worker/jobs";
import { getOndemandSyncQueue } from "@/worker/sync/ondemand-queue";
import { modelsForArea } from "@/worker/sync/ondemand-cycle";

export interface ForcarSyncResultado {
  ok: boolean;
  /** O cron incremental já estava rodando (best-effort, lido do lock Redis). */
  jaEmAndamento?: boolean;
  erro?: string;
}

/**
 * Dispara um sync sob demanda, escopado aos modelos da área, SEM tocar no
 * scheduler do cron. One-shot na fila do worker, com jobId determinístico
 * (dedupe nativo: cliques repetidos não empilham ciclos). Gated por
 * `diretoria.sync.force`. NÃO importa worker/index.ts (que tem side effects).
 */
export async function forcarSyncDiretoria(
  area: string,
): Promise<ForcarSyncResultado> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, erro: "Não autenticado" };
  if (!(await canDiretoria(user, "diretoria.sync.force"))) {
    return { ok: false, erro: "Sem permissão para forçar a atualização" };
  }

  const models = modelsForArea(area);
  // Áreas sem modelos Odoo (ex.: agenda, dado nativo) não disparam sync.
  if (models.length === 0) return { ok: true };

  // Best-effort: o cron incremental já está rodando? (lê o lock, nunca o seta)
  let jaEmAndamento = false;
  try {
    const redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    await redis.connect();
    jaEmAndamento = Boolean(await redis.get("odoo-sync:lock:incremental"));
    await redis.quit();
  } catch {
    // sem feedback de lock; segue (o worker serializa de qualquer forma)
  }

  await getOndemandSyncQueue().add(
    JOB_ONDEMAND,
    { models },
    {
      // BullMQ nao aceita ":" em custom jobId ("Custom Id cannot contain :"),
      // por isso "-" e nao ":". Continua deterministico por area (dedupe nativo).
      jobId: `ondemand-${area}`,
      removeOnComplete: true,
      removeOnFail: true,
    },
  );

  return { ok: true, jaEmAndamento };
}
