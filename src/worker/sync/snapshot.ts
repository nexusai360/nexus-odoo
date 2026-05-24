// src/worker/sync/snapshot.ts
import type { OdooClient } from "../odoo/client";
import { parseWriteDate } from "../odoo/datetime";
import { getModelFields } from "../odoo/field-selection";

/** Tamanho do lote para o createMany , evita estourar limites do Postgres. */
const CREATE_BATCH = 1000;

interface SnapshotRawTable {
  count: (...args: unknown[]) => Promise<number>;
  deleteMany: (...args: unknown[]) => Promise<unknown>;
  createMany: (...args: unknown[]) => Promise<unknown>;
}

/**
 * Full refresh: apaga a tabela raw inteira e recria, numa transação.
 * `rawTableKey` é a propriedade do client Prisma (ex.: "rawEstoqueSaldoHoje").
 *
 * Guarda anti-cache-vazio (CR-02): se o pull do Odoo voltar 0 registros mas o
 * cache atual não estiver vazio, NÃO apaga a tabela , lança erro e o ciclo
 * marca `erro`, preservando os dados. Um pull vazio transitório (glitch de
 * permissão, domínio que retorna vazio) não pode zerar o dashboard.
 */
export async function syncSnapshot(
  client: OdooClient,
  prisma: {
    $transaction: <T>(fn: (tx: Record<string, never>) => Promise<T>) => Promise<T>;
  } & Record<string, unknown>,
  rawTableKey: string,
  odooModel: string,
): Promise<number> {
  const fields = await getModelFields(client, odooModel);
  const records = (await client.searchReadPaged(odooModel, [], { fields })) as Record<string, unknown>[];
  const now = new Date();
  const rows = records.map((rec) => ({
    odooId: Number(rec.id),
    data: rec,
    odooWriteDate: parseWriteDate(rec.write_date),
    syncedAt: now,
  }));

  if (rows.length === 0) {
    const existing = await (prisma[rawTableKey] as SnapshotRawTable).count();
    if (existing > 0) {
      // Pull vazio com cache não-vazio: aborta sem apagar nada.
      const { OdooError } = await import("../odoo/errors");
      throw new OdooError(
        `snapshot ${odooModel}: pull retornou 0 registros com cache de ${existing} linhas , refresh abortado para não destruir o cache`,
      );
    }
    // Cache já vazio e pull vazio: nada a fazer, sem wipe desnecessário.
    return 0;
  }

  await prisma.$transaction(async (tx) => {
    const raw = (tx as Record<string, SnapshotRawTable>)[rawTableKey];
    await raw.deleteMany({});
    for (let i = 0; i < rows.length; i += CREATE_BATCH) {
      await raw.createMany({ data: rows.slice(i, i + CREATE_BATCH) });
    }
  });
  return rows.length;
}
