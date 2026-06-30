// src/worker/jobs.ts
// Módulo PURO (só constantes/funções, sem side effects). Pode ser importado pelo
// app Next sem subir Workers nem reagendar crons (ao contrário de worker/index.ts).
export const JOB_INCREMENTAL = "incremental";
export const JOB_SNAPSHOT = "snapshot";
export const JOB_RECONCILE = "reconcile";
export const JOB_CONFIG_CHECK = "config-check";
/** Sync sob demanda (botão "Atualizar agora" da Diretoria): ciclo incremental
 * escopado aos modelos da tela. One-shot, NÃO entra no scheduler repeat. */
export const JOB_ONDEMAND = "ondemand";

/** Nome da fila do cron de sync. Fonte única (também usada por worker/index.ts e
 * pelo acessor lazy do app), para o job sob demanda cair na MESMA fila que o
 * worker já consome. */
export const ODOO_SYNC_QUEUE_NAME = "odoo-sync";

/** odooModel -> propriedade do client Prisma. estoque.saldo.hoje -> rawEstoqueSaldoHoje. */
export function rawDelegateKey(odooModel: string): string {
  const pascal = odooModel
    .split(".")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
  return "raw" + pascal;
}
