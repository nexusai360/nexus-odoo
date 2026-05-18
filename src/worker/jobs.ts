// src/worker/jobs.ts
export const JOB_INCREMENTAL = "incremental";
export const JOB_SNAPSHOT = "snapshot";
export const JOB_RECONCILE = "reconcile";
export const JOB_CONFIG_CHECK = "config-check";

/** odooModel -> propriedade do client Prisma. estoque.saldo.hoje -> rawEstoqueSaldoHoje. */
export function rawDelegateKey(odooModel: string): string {
  const pascal = odooModel
    .split(".")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
  return "raw" + pascal;
}
