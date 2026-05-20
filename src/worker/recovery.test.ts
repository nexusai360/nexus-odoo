/**
 * Testes do helper de recovery (self-healing após indisponibilidade Tauga).
 */

import {
  clearAllPending,
  clearPending,
  isOdooUnavailable,
  markPending,
  PENDING_KEY,
  readPending,
} from "./recovery";

class FakeRedis {
  private store = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<"OK"> {
    this.store.set(key, value);
    return "OK";
  }
  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }
}

function makeRedis() {
  // O helper só usa get/set/del — FakeRedis basta.
  return new FakeRedis() as unknown as Parameters<typeof readPending>[0];
}

describe("isOdooUnavailable", () => {
  const cases: Array<[string, boolean]> = [
    ["OdooError: HTTP 502 Bad Gateway", true],
    ["Service Unavailable: HTTP 503", true],
    ["HTTP 504 Gateway Timeout em common.authenticate", true],
    ["<title>Tauga - Manutenção</title>", true],
    ["Server under Maintenance", true],
    ["connect ECONNREFUSED 192.168.0.1:8069", true],
    ["ETIMEDOUT", true],
    ["ENOTFOUND grupojht.tauga.online", true],
    ["socket hang up", true],
    ["OdooError: common.authenticate falhou após 3 tentativas: HTTP 502", true],
    ["AuthError: senha inválida", false],
    ["ReferenceError: foo is not defined", false],
    ["", false],
  ];

  it.each(cases)("classifica %s como %s", (msg, expected) => {
    expect(isOdooUnavailable(new Error(msg))).toBe(expected);
  });

  it("aceita não-Error", () => {
    expect(isOdooUnavailable("HTTP 502")).toBe(true);
    expect(isOdooUnavailable(null)).toBe(false);
    expect(isOdooUnavailable(undefined)).toBe(false);
  });
});

describe("readPending / markPending / clearPending", () => {
  it("retorna {false,false} quando nada gravado", async () => {
    const r = makeRedis();
    expect(await readPending(r)).toEqual({ snapshot: false, reconcile: false });
  });

  it("marca e lê snapshot pendente", async () => {
    const r = makeRedis();
    await markPending(r, "snapshot");
    expect(await readPending(r)).toEqual({ snapshot: true, reconcile: false });
  });

  it("marca os dois e remove key quando tudo limpo", async () => {
    const r = makeRedis();
    await markPending(r, "snapshot");
    await markPending(r, "reconcile");
    expect(await readPending(r)).toEqual({ snapshot: true, reconcile: true });
    await clearPending(r, "snapshot");
    expect(await readPending(r)).toEqual({ snapshot: false, reconcile: true });
    await clearPending(r, "reconcile");
    // chave foi apagada
    expect(await (r as unknown as FakeRedis).get(PENDING_KEY)).toBeNull();
  });

  it("é idempotente em markPending repetido", async () => {
    const r = makeRedis();
    await markPending(r, "snapshot");
    await markPending(r, "snapshot");
    expect(await readPending(r)).toEqual({ snapshot: true, reconcile: false });
  });

  it("clearAllPending zera tudo", async () => {
    const r = makeRedis();
    await markPending(r, "snapshot");
    await markPending(r, "reconcile");
    await clearAllPending(r);
    expect(await readPending(r)).toEqual({ snapshot: false, reconcile: false });
  });

  it("tolera JSON corrompido na chave", async () => {
    const r = makeRedis();
    await (r as unknown as FakeRedis).set(PENDING_KEY, "{not-json");
    expect(await readPending(r)).toEqual({ snapshot: false, reconcile: false });
  });
});
