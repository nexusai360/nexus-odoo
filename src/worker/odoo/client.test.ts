import { OdooClient } from "./client";
import { OdooRpcFault } from "./errors";

function mockFetchOnce(body: unknown, ok = true) {
  return jest.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "Internal Server Error",
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

  it("WR-06: 4xx não é retryado — propaga imediatamente", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "credencial inválida",
      json: async () => ({}),
    });
    global.fetch = fetchMock as never;
    const c = new OdooClient({ ...base, throttleMs: 0, retries: 3, backoffMs: 1 });
    await expect(c.version()).rejects.toThrow(/HTTP 401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("WR-06: 5xx é retryado", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      text: async () => "indisponível",
      json: async () => ({}),
    });
    global.fetch = fetchMock as never;
    const c = new OdooClient({ ...base, throttleMs: 0, retries: 2, backoffMs: 1 });
    await expect(c.version()).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("CR-03: a senha não vaza na mensagem de erro final", async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error("falha de rede com s3nh4 embutida"));
    global.fetch = fetchMock as never;
    const c = new OdooClient({ ...base, password: "s3nh4", throttleMs: 0, retries: 1, backoffMs: 1 });
    await expect(c.version()).rejects.toMatchObject({
      message: expect.not.stringContaining("s3nh4"),
    });
  });
});

describe("OdooClient.searchReadPaged", () => {
  const base = { url: "http://odoo", db: "d", username: "u", password: "p" };

  it("pagina até a página vir menor que o limit", async () => {
    const pag1 = Array.from({ length: 2 }, (_, i) => ({ id: i + 1 }));
    const pag2 = [{ id: 3 }];
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ result: 11 }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ result: pag1 }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ result: pag2 }) });
    global.fetch = fetchMock as never;
    const c = new OdooClient({ ...base, throttleMs: 0 });
    await c.authenticate();
    const todos = await c.searchReadPaged("res.partner", [], { pageSize: 2 });
    expect(todos.map((r) => (r as { id: number }).id)).toEqual([1, 2, 3]);
  });

  it("WR-05: passa order estável id asc nos kwargs", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ result: 11 }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ result: [] }) });
    global.fetch = fetchMock as never;
    const c = new OdooClient({ ...base, throttleMs: 0 });
    await c.authenticate();
    await c.searchReadPaged("res.partner", [], { pageSize: 500 });
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    const kwargs = body.params.args[6];
    expect(kwargs.order).toBe("id asc");
  });
});
