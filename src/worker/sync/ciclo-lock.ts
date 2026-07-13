// src/worker/sync/ciclo-lock.ts
//
// Lock do ciclo de sync com DONO e HEARTBEAT.
//
// O problema que isto resolve (visto em produção em 2026-07-12): o lock era um
// SET NX com TTL de 15 min e nenhum dono. Quando o worker morria no meio de um
// ciclo (OOM, deploy, restart), o lock ficava para trás; o worker novo subia,
// via a chave ocupada e PULAVA os ciclos até o TTL de 15 min vencer. Na prática,
// todo restart custava até 15 minutos de sync parada, e o operador precisava
// destravar na mão (scripts/_prod-redis-lock.py --destravar).
//
// A correção tem duas partes:
//   1. TTL curto (90s) + HEARTBEAT: quem está com o lock renova o TTL a cada 30s
//      enquanto o ciclo roda. Ciclo honesto e longo (snapshot/reconcile levam
//      minutos) segue protegido; processo morto para de renovar e o lock cai
//      sozinho em no máximo 90s.
//   2. DONO: o valor da chave identifica o processo que a criou, e a liberação é
//      compare-and-delete. Sem isso, um worker atrasado poderia apagar o lock que
//      outro já tinha adquirido depois da expiração.
//
// Por que não "limpar o lock no boot": o worker não tem como distinguir um lock
// órfão de um lock de outra réplica viva. Apagar no boot funcionaria hoje
// (replicas=1), mas viraria uma bomba no dia em que subir uma segunda réplica ,
// dois ciclos rodando o mesmo sync em cima do mesmo cache. O heartbeat resolve
// sem essa premissa.

import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

/** TTL da chave. Curto de propósito: é o teto do prejuízo de um lock órfão. */
export const LOCK_TTL_MS = 90_000;
/** De quanto em quanto tempo o dono renova o TTL enquanto o ciclo roda. */
export const HEARTBEAT_MS = 30_000;

/** Chave do lock. Formato preservado (é o que os scripts de prod já inspecionam). */
export const lockKeyCiclo = (jobName: string): string => `odoo-sync:lock:${jobName}`;

/** Renova o TTL só se a chave ainda for nossa. */
const RENOVAR_SE_DONO = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('pexpire', KEYS[1], ARGV[2])
end
return 0`;

/** Apaga a chave só se ela ainda for nossa (compare-and-delete). */
const LIBERAR_SE_DONO = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0`;

/** O pedaço do ioredis que este módulo usa (facilita testar sem Redis de verdade). */
export interface RedisLock {
  set(
    key: string,
    valor: string,
    px: "PX",
    ttlMs: number,
    nx: "NX",
  ): Promise<string | null>;
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
}

export interface CicloLock {
  /** Identifica este processo. Muda a cada boot , é o que torna o lock órfão detectável. */
  readonly donoId: string;
  adquirir(jobName: string): Promise<boolean>;
  liberar(jobName: string): Promise<void>;
  /** Para todos os heartbeats (usado no shutdown e nos testes). Não libera os locks. */
  pararTudo(): void;
}

export interface OpcoesCicloLock {
  donoId?: string;
  ttlMs?: number;
  heartbeatMs?: number;
  onAviso?: (msg: string) => void;
}

export function criarCicloLock(redis: RedisLock, opcoes: OpcoesCicloLock = {}): CicloLock {
  const donoId = opcoes.donoId ?? `${hostname()}:${process.pid}:${randomUUID()}`;
  const ttlMs = opcoes.ttlMs ?? LOCK_TTL_MS;
  const heartbeatMs = opcoes.heartbeatMs ?? HEARTBEAT_MS;
  const aviso = opcoes.onAviso ?? ((msg: string) => console.warn(msg));
  const batidas = new Map<string, NodeJS.Timeout>();

  function pararHeartbeat(jobName: string): void {
    const t = batidas.get(jobName);
    if (t) {
      clearInterval(t);
      batidas.delete(jobName);
    }
  }

  function iniciarHeartbeat(jobName: string): void {
    pararHeartbeat(jobName);
    const timer = setInterval(() => {
      void (async () => {
        try {
          const r = await redis.eval(
            RENOVAR_SE_DONO,
            1,
            lockKeyCiclo(jobName),
            donoId,
            String(ttlMs),
          );
          if (Number(r) !== 1) {
            // A chave sumiu ou já é de outro dono: não adianta insistir. Continuar
            // renovando aqui só reescreveria o TTL de um lock que não é nosso.
            pararHeartbeat(jobName);
            aviso(
              `[worker] lock "${jobName}" deixou de ser nosso (dono=${donoId}) , heartbeat parado`,
            );
          }
        } catch (err) {
          aviso(`[worker] falha ao renovar o lock "${jobName}": ${String(err)}`);
        }
      })();
    }, heartbeatMs);
    // Não segura o event loop: o processo pode encerrar mesmo com heartbeat ativo.
    timer.unref?.();
    batidas.set(jobName, timer);
  }

  return {
    donoId,

    async adquirir(jobName: string): Promise<boolean> {
      const ok = await redis.set(lockKeyCiclo(jobName), donoId, "PX", ttlMs, "NX");
      if (ok !== "OK") return false;
      iniciarHeartbeat(jobName);
      return true;
    },

    async liberar(jobName: string): Promise<void> {
      pararHeartbeat(jobName);
      await redis.eval(LIBERAR_SE_DONO, 1, lockKeyCiclo(jobName), donoId);
    },

    pararTudo(): void {
      for (const jobName of [...batidas.keys()]) pararHeartbeat(jobName);
    },
  };
}
