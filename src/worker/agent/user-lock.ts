import { redis } from "@/lib/redis";

/**
 * TTL do lock por usuário. Alinhado à spec §8 ("TTL >= timeout do turno, ex.:
 * 120s"): 120_000 ms. Justificativa do número: o turno do agente é limitado por
 * `maxIterations` (run-agent.ts), não por um timeout em ms fixo; 120s é o teto
 * prático observado (a spec cita 120s) e cobre com folga um turno normal. Como
 * NÃO há renovação aqui (lock simples SET NX PX), o TTL é o teto de proteção: se
 * um turno exceder 120s (raro , só num loop de tools muito longo), o lock expira
 * e uma 2a mensagem do mesmo usuário poderia entrar. Isso é aceitável
 * (degradação graciosa, não corrupção, pois a sessão é a mesma) e é o pior caso
 * documentado. Se a operação mostrar turnos > 120s recorrentes, subir o TTL ou
 * adicionar renovação periódica do lock (watchdog) , NÃO usar TTL infinito
 * (deadlock se o worker morrer).
 */
const USER_LOCK_TTL_MS = 120_000;

function key(userId: string): string {
  return `agent:lock:wa:${userId}`;
}

/** Tenta adquirir o lock do usuário (cluster-safe via SET NX PX). */
export async function acquireUserLock(userId: string): Promise<boolean> {
  const res = await redis.set(key(userId), String(Date.now()), "PX", USER_LOCK_TTL_MS, "NX");
  return res === "OK";
}

/** Libera o lock do usuário. */
export async function releaseUserLock(userId: string): Promise<void> {
  await redis.del(key(userId));
}
