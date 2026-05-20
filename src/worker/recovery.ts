/**
 * Recovery — self-healing do worker frente a indisponibilidade do Odoo.
 *
 * Regra: o incremental roda de 3 em 3 min (configurável) e é o "health check"
 * vivo do Tauga. Snapshot (1/dia) e reconcile (1/dia) rodam pouco. Quando o
 * Tauga está fora do ar:
 *   - Incremental tenta a cada ciclo (e falha de leve).
 *   - Snapshot / reconcile, se caírem nessa janela, marcam um flag de
 *     "pendente após recovery" no Redis em vez de só falhar.
 *   - O próximo incremental bem-sucedido drena os flags pendentes
 *     enfileirando os jobs em modo "now" — ao final, o estado volta ao
 *     normal (3min/24h conforme configurado).
 *
 * Storage: chave `odoo-sync:pending-recovery` no Redis (uma string JSON
 * `{"snapshot": true, "reconcile": false}`). Não usamos sync_state porque
 * é por modelo; aqui o flag é global por tipo de ciclo.
 *
 * Detecção de "Odoo indisponível": erro com message que case com qualquer
 * padrão da lista UNAVAILABILITY_PATTERNS (HTTP 502/503/504, página de
 * manutenção do Tauga, ECONNREFUSED, ETIMEDOUT, etc.).
 */

import type IORedis from "ioredis";

export const PENDING_KEY = "odoo-sync:pending-recovery";

/** Padrões de mensagem de erro que indicam Tauga/Odoo indisponível. */
const UNAVAILABILITY_PATTERNS = [
  /HTTP 50[234]/i, // 502 Bad Gateway, 503 Unavailable, 504 Timeout
  /Manutenção/i, // página HTML do Tauga
  /Maintenance/i,
  /ECONNREFUSED/,
  /ETIMEDOUT/,
  /ENOTFOUND/,
  /socket hang up/i,
  /authenticate falhou após/i, // OdooClient esgota retries
] as const;

/** Tipos de ciclo que podem ser "represados" durante indisponibilidade. */
export type RecoverableCycle = "snapshot" | "reconcile";

export interface PendingFlags {
  snapshot: boolean;
  reconcile: boolean;
}

const EMPTY: PendingFlags = { snapshot: false, reconcile: false };

export function isOdooUnavailable(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? `${err.message}\n${err.stack ?? ""}`
      : String(err ?? "");
  return UNAVAILABILITY_PATTERNS.some((re) => re.test(msg));
}

export async function readPending(connection: IORedis): Promise<PendingFlags> {
  const raw = await connection.get(PENDING_KEY);
  if (!raw) return { ...EMPTY };
  try {
    const obj = JSON.parse(raw) as Partial<PendingFlags>;
    return {
      snapshot: Boolean(obj.snapshot),
      reconcile: Boolean(obj.reconcile),
    };
  } catch {
    return { ...EMPTY };
  }
}

async function writePending(
  connection: IORedis,
  flags: PendingFlags,
): Promise<void> {
  if (!flags.snapshot && !flags.reconcile) {
    await connection.del(PENDING_KEY);
    return;
  }
  await connection.set(PENDING_KEY, JSON.stringify(flags));
}

export async function markPending(
  connection: IORedis,
  cycle: RecoverableCycle,
): Promise<void> {
  const cur = await readPending(connection);
  if (cur[cycle]) return;
  cur[cycle] = true;
  await writePending(connection, cur);
}

export async function clearPending(
  connection: IORedis,
  cycle: RecoverableCycle,
): Promise<void> {
  const cur = await readPending(connection);
  if (!cur[cycle]) return;
  cur[cycle] = false;
  await writePending(connection, cur);
}

export async function clearAllPending(connection: IORedis): Promise<void> {
  await connection.del(PENDING_KEY);
}
