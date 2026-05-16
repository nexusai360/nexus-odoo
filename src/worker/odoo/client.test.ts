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
