// src/worker/sync/ciclo-lock.test.ts

import { criarCicloLock, lockKeyCiclo, LOCK_TTL_MS, HEARTBEAT_MS } from "./ciclo-lock";
import type { RedisLock } from "./ciclo-lock";

/**
 * Redis de mentira com o mínimo que o lock usa: SET com NX/PX, GET, DEL e EVAL
 * dos dois scripts (renovar-se-dono e liberar-se-dono). O TTL é guardado, não
 * expirado sozinho , quem quiser simular expiração chama `expirar(key)`.
 */
function fakeRedis() {
  const store = new Map<string, { valor: string; ttlMs: number }>();
  const redis: RedisLock & {
    store: typeof store;
    expirar: (k: string) => void;
  } = {
    store,
    expirar: (k) => void store.delete(k),
    async set(key, valor, _px, ttlMs, _nx) {
      if (store.has(key)) return null;
      store.set(key, { valor, ttlMs });
      return "OK";
    },
    async eval(script: string, _n: number, key: string, dono: string, ttl?: string) {
      const atual = store.get(key);
      if (!atual || atual.valor !== dono) return 0;
      if (script.includes("pexpire")) {
        atual.ttlMs = Number(ttl);
        return 1;
      }
      store.delete(key);
      return 1;
    },
  };
  return redis;
}

describe("lockKeyCiclo", () => {
  it("mantém a chave que já existe em produção", () => {
    expect(lockKeyCiclo("incremental")).toBe("odoo-sync:lock:incremental");
  });
});

describe("constantes", () => {
  it("o TTL é curto o bastante para um lock órfão não prender a fila por muito tempo", () => {
    // O problema que este módulo resolve: com TTL de 15 min, todo restart do worker
    // deixava o lock preso e o worker novo pulava ciclos por até 15 min.
    expect(LOCK_TTL_MS).toBeLessThanOrEqual(2 * 60_000);
  });

  it("o heartbeat renova com folga antes do TTL vencer", () => {
    expect(HEARTBEAT_MS * 2).toBeLessThanOrEqual(LOCK_TTL_MS);
  });
});

describe("criarCicloLock", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("adquire o lock gravando o próprio dono e o TTL", async () => {
    const redis = fakeRedis();
    const lock = criarCicloLock(redis, { donoId: "worker-a" });

    await expect(lock.adquirir("incremental")).resolves.toBe(true);
    expect(redis.store.get("odoo-sync:lock:incremental")).toEqual({
      valor: "worker-a",
      ttlMs: LOCK_TTL_MS,
    });
    await lock.liberar("incremental");
  });

  it("não adquire quando outro dono já tem o lock", async () => {
    const redis = fakeRedis();
    const outro = criarCicloLock(redis, { donoId: "worker-a" });
    const nosso = criarCicloLock(redis, { donoId: "worker-b" });

    await outro.adquirir("incremental");
    await expect(nosso.adquirir("incremental")).resolves.toBe(false);
    await outro.liberar("incremental");
  });

  it("renova o TTL enquanto o ciclo roda (heartbeat)", async () => {
    const redis = fakeRedis();
    const lock = criarCicloLock(redis, { donoId: "worker-a" });
    await lock.adquirir("incremental");

    // Simula o TTL correndo: sem heartbeat, o lock venceria no meio de um ciclo longo.
    redis.store.get("odoo-sync:lock:incremental")!.ttlMs = 1;
    await jest.advanceTimersByTimeAsync(HEARTBEAT_MS);

    expect(redis.store.get("odoo-sync:lock:incremental")!.ttlMs).toBe(LOCK_TTL_MS);
    await lock.liberar("incremental");
  });

  it("para o heartbeat ao liberar", async () => {
    const redis = fakeRedis();
    const lock = criarCicloLock(redis, { donoId: "worker-a" });
    await lock.adquirir("incremental");
    await lock.liberar("incremental");

    const eval_ = jest.spyOn(redis, "eval");
    await jest.advanceTimersByTimeAsync(HEARTBEAT_MS * 3);
    expect(eval_).not.toHaveBeenCalled();
  });

  it("libera só o próprio lock (não apaga o lock de outro dono)", async () => {
    const redis = fakeRedis();
    const dono = criarCicloLock(redis, { donoId: "worker-a" });
    const intruso = criarCicloLock(redis, { donoId: "worker-b" });

    await dono.adquirir("incremental");
    await intruso.liberar("incremental"); // não é dele: não pode apagar

    expect(redis.store.has("odoo-sync:lock:incremental")).toBe(true);
    await dono.liberar("incremental");
    expect(redis.store.has("odoo-sync:lock:incremental")).toBe(false);
  });

  it("para o heartbeat se o lock deixou de ser nosso (expirou e outro pegou)", async () => {
    const redis = fakeRedis();
    const lock = criarCicloLock(redis, { donoId: "worker-a" });
    await lock.adquirir("incremental");

    // O lock expirou e outro worker o adquiriu.
    redis.store.set("odoo-sync:lock:incremental", { valor: "worker-b", ttlMs: LOCK_TTL_MS });
    await jest.advanceTimersByTimeAsync(HEARTBEAT_MS);

    const eval_ = jest.spyOn(redis, "eval");
    await jest.advanceTimersByTimeAsync(HEARTBEAT_MS * 3);
    expect(eval_).not.toHaveBeenCalled(); // desistiu de renovar
    expect(redis.store.get("odoo-sync:lock:incremental")!.valor).toBe("worker-b");
  });

  it("um dono novo (worker reiniciado) consegue o lock assim que o TTL do órfão vence", async () => {
    const redis = fakeRedis();
    const antigo = criarCicloLock(redis, { donoId: "worker-morto" });
    await antigo.adquirir("incremental");
    antigo.pararTudo(); // o processo morreu: ninguém mais renova

    const novo = criarCicloLock(redis, { donoId: "worker-novo" });
    await expect(novo.adquirir("incremental")).resolves.toBe(false); // ainda dentro do TTL

    redis.expirar("odoo-sync:lock:incremental"); // TTL de 90s vence
    await expect(novo.adquirir("incremental")).resolves.toBe(true);
    await novo.liberar("incremental");
  });
});
