import { OdooClient } from "./client";
import { OdooRpcFault } from "./errors";

function mockFetchOnce(body: unknown, ok = true) {
  return jest.fn().mockResolvedValue({
    ok,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

describe("OdooClient._rpc", () => {
  const base = { url: "http://odoo", db: "d", username: "u", password: "p" };

  it("retorna result em resposta de sucesso", async () => {
    global.fetch = mockFetchOnce({ jsonrpc: "2.0", id: 1, result: 42 }) as never;
    const c = new OdooClient({ ...base, throttleMs: 0 });
    await expect(c.version()).resolves.toBe(42);
  });

  it("lança OdooRpcFault quando a resposta tem error", async () => {
    global.fetch = mockFetchOnce({ error: { data: { message: "boom" } } }) as never;
    const c = new OdooClient({ ...base, throttleMs: 0 });
    await expect(c.version()).rejects.toBeInstanceOf(OdooRpcFault);
  });

  it("faz retry em erro de rede e desiste após N tentativas", async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error("ECONNRESET"));
    global.fetch = fetchMock as never;
    const c = new OdooClient({ ...base, throttleMs: 0, retries: 2, backoffMs: 1 });
    await expect(c.version()).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("OdooClient.searchReadPaged", () => {
  const base = { url: "http://odoo", db: "d", username: "u", password: "p" };

  it("pagina até a página vir menor que o limit", async () => {
    const pag1 = Array.from({ length: 2 }, (_, i) => ({ id: i + 1 }));
    const pag2 = [{ id: 3 }];
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: 11 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: pag1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: pag2 }) });
    global.fetch = fetchMock as never;
    const c = new OdooClient({ ...base, throttleMs: 0 });
    await c.authenticate();
    const todos = await c.searchReadPaged("res.partner", [], { pageSize: 2 });
    expect(todos.map((r) => (r as { id: number }).id)).toEqual([1, 2, 3]);
  });
});
