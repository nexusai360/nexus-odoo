// src/worker/odoo/__tests__/client-writes.test.ts
//
// Testa os métodos de escrita adicionados ao OdooClient em Bloco C,
// a factory clientFromEnv(mode) e mapOdooFault.
//
// Estratégia de mock: substituímos o método privado `rpc` via cast
// para evitar chamadas HTTP reais. O executeKw delega para rpc internamente.

import { OdooClient } from "../client";
import {
  mapOdooFault,
  OdooAccessError,
  OdooValidationError,
  OdooUserError,
  OdooMissingError,
  OdooIntegrityError,
  OdooNotImplementedError,
  OdooPoolExhaustedError,
  OdooUnavailableError,
  OdooInternalError,
  OdooError,
} from "../errors";
import { clientFromEnv } from "../client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Cria um OdooClient já autenticado com rpc mockado. */
function makeClient(rpcResult: unknown) {
  const client = new OdooClient({
    url: "http://odoo.test",
    db: "testdb",
    username: "admin",
    password: "secret",
  });
  // Forçar uid para simular autenticação prévia
  client.uid = 1;
  // Substituir método privado rpc por mock
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).rpc = jest.fn().mockResolvedValue(rpcResult);
  return client;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function captureRpc(client: OdooClient): jest.Mock {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client as any).rpc as jest.Mock;
}

// ---------------------------------------------------------------------------
// 1. create
// ---------------------------------------------------------------------------
describe("OdooClient.create", () => {
  it("chama execute_kw com args corretos e retorna id", async () => {
    const client = makeClient(42);
    const id = await client.create("res.partner", { name: "X" });
    expect(id).toBe(42);
    const rpc = captureRpc(client);
    expect(rpc).toHaveBeenCalledWith("object", "execute_kw", [
      "testdb",
      1,
      "secret",
      "res.partner",
      "create",
      [{ name: "X" }],
      {},
    ]);
  });
});

// ---------------------------------------------------------------------------
// 2. write
// ---------------------------------------------------------------------------
describe("OdooClient.write", () => {
  it("chama execute_kw com ids e vals corretos e retorna boolean", async () => {
    const client = makeClient(true);
    const result = await client.write("res.partner", [1], { name: "Y" });
    expect(result).toBe(true);
    const rpc = captureRpc(client);
    expect(rpc).toHaveBeenCalledWith("object", "execute_kw", [
      "testdb",
      1,
      "secret",
      "res.partner",
      "write",
      [[1], { name: "Y" }],
      {},
    ]);
  });
});

// ---------------------------------------------------------------------------
// 3. unlink
// ---------------------------------------------------------------------------
describe("OdooClient.unlink", () => {
  it("chama execute_kw com ids corretos e retorna boolean", async () => {
    const client = makeClient(true);
    const result = await client.unlink("res.partner", [1]);
    expect(result).toBe(true);
    const rpc = captureRpc(client);
    expect(rpc).toHaveBeenCalledWith("object", "execute_kw", [
      "testdb",
      1,
      "secret",
      "res.partner",
      "unlink",
      [[1]],
      {},
    ]);
  });
});

// ---------------------------------------------------------------------------
// 4. read
// ---------------------------------------------------------------------------
describe("OdooClient.read", () => {
  it("chama execute_kw com kwargs={fields} correto", async () => {
    const client = makeClient([{ id: 1, name: "Test" }]);
    const result = await client.read("res.partner", [1], ["name"]);
    expect(result).toEqual([{ id: 1, name: "Test" }]);
    const rpc = captureRpc(client);
    expect(rpc).toHaveBeenCalledWith("object", "execute_kw", [
      "testdb",
      1,
      "secret",
      "res.partner",
      "read",
      [[1]],
      { fields: ["name"] },
    ]);
  });
});

// ---------------------------------------------------------------------------
// 5. searchRead
// ---------------------------------------------------------------------------
describe("OdooClient.searchRead", () => {
  it("combina search+read em uma chamada search_read com fields e options", async () => {
    const rows = [{ id: 1, name: "A" }];
    const client = makeClient(rows);
    const result = await client.searchRead<{ id: number; name: string }>(
      "res.partner",
      [["active", "=", true]],
      ["name"],
      { limit: 10, order: "name asc" },
    );
    expect(result).toEqual(rows);
    const rpc = captureRpc(client);
    expect(rpc).toHaveBeenCalledWith("object", "execute_kw", [
      "testdb",
      1,
      "secret",
      "res.partner",
      "search_read",
      [[["active", "=", true]]],
      { fields: ["name"], limit: 10, order: "name asc" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// 6. fieldsGet
// ---------------------------------------------------------------------------
describe("OdooClient.fieldsGet", () => {
  it("retorna descritores de campos sem attributes", async () => {
    const descriptor = { name: { string: "Name", type: "char" } };
    const client = makeClient(descriptor);
    const result = await client.fieldsGet("res.partner");
    expect(result).toEqual(descriptor);
    const rpc = captureRpc(client);
    expect(rpc).toHaveBeenCalledWith("object", "execute_kw", [
      "testdb",
      1,
      "secret",
      "res.partner",
      "fields_get",
      [],
      {},
    ]);
  });

  it("passa attributes quando fornecidos", async () => {
    const client = makeClient({});
    await client.fieldsGet("res.partner", ["string", "type"]);
    const rpc = captureRpc(client);
    expect(rpc).toHaveBeenCalledWith("object", "execute_kw", [
      "testdb",
      1,
      "secret",
      "res.partner",
      "fields_get",
      [false, ["string", "type"]],
      {},
    ]);
  });
});

// ---------------------------------------------------------------------------
// 7. searchIrModelData
// ---------------------------------------------------------------------------
describe("OdooClient.searchIrModelData", () => {
  it("retorna {id, res_id} quando encontrado", async () => {
    const client = makeClient([{ id: 5, res_id: 10 }]);
    const result = await client.searchIrModelData("res.partner", "partner_key");
    expect(result).toEqual({ id: 5, res_id: 10 });
  });

  it("retorna null quando não encontrado", async () => {
    const client = makeClient([]);
    const result = await client.searchIrModelData("res.partner", "partner_key");
    expect(result).toBeNull();
  });

  it("chama ir.model.data com domínio correto", async () => {
    const client = makeClient([]);
    await client.searchIrModelData("res.partner", "partner_key");
    const rpc = captureRpc(client);
    expect(rpc).toHaveBeenCalledWith("object", "execute_kw", [
      "testdb",
      1,
      "secret",
      "ir.model.data",
      "search_read",
      [[["model", "=", "res.partner"], ["module", "=", "mcp_nexus"], ["name", "=", "partner_key"]]],
      { fields: ["id", "res_id"], limit: 1 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// 8. clientFromEnv("read") — lê ODOO_*
// ---------------------------------------------------------------------------
describe("clientFromEnv('read')", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ODOO_URL: "http://read.test",
      ODOO_DB: "readdb",
      ODOO_USERNAME: "readuser",
      ODOO_PASSWORD: "readpass",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("cria OdooClient com credenciais ODOO_*", () => {
    const client = clientFromEnv("read");
    expect(client).toBeInstanceOf(OdooClient);
  });

  it("também funciona sem argumento (backward compat)", () => {
    const client = clientFromEnv();
    expect(client).toBeInstanceOf(OdooClient);
  });

  it("lança OdooError quando variável faltando", () => {
    delete process.env.ODOO_PASSWORD;
    expect(() => clientFromEnv("read")).toThrow(OdooError);
  });
});

// ---------------------------------------------------------------------------
// 9. clientFromEnv("write") — lê ODOO_WRITE_*
// ---------------------------------------------------------------------------
describe("clientFromEnv('write') — lê ODOO_WRITE_*", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ODOO_WRITE_URL: "http://write.test",
      ODOO_WRITE_DB: "writedb",
      ODOO_WRITE_USER: "writeuser",
      ODOO_WRITE_PASSWORD: "writepass",
      // Base read vars (não devem ser usadas no modo write quando write vars presentes)
      ODOO_URL: "http://read.test",
      ODOO_DB: "readdb",
      ODOO_USERNAME: "readuser",
      ODOO_PASSWORD: "readpass",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("cria OdooClient sem lançar erro quando ODOO_WRITE_* completo", () => {
    const client = clientFromEnv("write");
    expect(client).toBeInstanceOf(OdooClient);
  });
});

// ---------------------------------------------------------------------------
// 10. clientFromEnv("write") — fallback para ODOO_* quando write vars ausentes
// ---------------------------------------------------------------------------
describe("clientFromEnv('write') — fallback para ODOO_*", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ODOO_URL: "http://read.test",
      ODOO_DB: "readdb",
      ODOO_USERNAME: "readuser",
      ODOO_PASSWORD: "readpass",
      // Sem ODOO_WRITE_* — deve usar ODOO_*
    };
    delete process.env.ODOO_WRITE_URL;
    delete process.env.ODOO_WRITE_DB;
    delete process.env.ODOO_WRITE_USER;
    delete process.env.ODOO_WRITE_PASSWORD;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("usa ODOO_* como fallback quando ODOO_WRITE_* ausente", () => {
    const client = clientFromEnv("write");
    expect(client).toBeInstanceOf(OdooClient);
  });
});

// ---------------------------------------------------------------------------
// 11. mapOdooFault — classificação por regex no fault.data.name
// ---------------------------------------------------------------------------
describe("mapOdooFault", () => {
  it("retorna OdooAccessError para AccessError", () => {
    const err = mapOdooFault({ data: { name: "odoo.exceptions.AccessError", message: "x" } });
    expect(err).toBeInstanceOf(OdooAccessError);
    expect(err.message).toBe("x");
  });

  it("retorna OdooValidationError para ValidationError", () => {
    const err = mapOdooFault({ data: { name: "ValidationError", message: "val" } });
    expect(err).toBeInstanceOf(OdooValidationError);
  });

  it("retorna OdooUserError para UserError", () => {
    const err = mapOdooFault({ data: { name: "UserError", message: "u" } });
    expect(err).toBeInstanceOf(OdooUserError);
  });

  it("retorna OdooMissingError para MissingError", () => {
    const err = mapOdooFault({ data: { name: "MissingError", message: "m" } });
    expect(err).toBeInstanceOf(OdooMissingError);
  });

  it("retorna OdooIntegrityError para IntegrityError", () => {
    const err = mapOdooFault({ data: { name: "IntegrityError", message: "i" } });
    expect(err).toBeInstanceOf(OdooIntegrityError);
  });

  it("retorna OdooNotImplementedError para NotImplementedError", () => {
    const err = mapOdooFault({ data: { name: "NotImplementedError", message: "n" } });
    expect(err).toBeInstanceOf(OdooNotImplementedError);
  });

  it("retorna OdooPoolExhaustedError para PoolError", () => {
    const err = mapOdooFault({ data: { name: "PoolError", message: "p" } });
    expect(err).toBeInstanceOf(OdooPoolExhaustedError);
  });

  it("retorna OdooInternalError para nome desconhecido", () => {
    const err = mapOdooFault({ data: { name: "SomethingElse", message: "s" } });
    expect(err).toBeInstanceOf(OdooInternalError);
  });

  it("usa fault.message quando data.message ausente", () => {
    const err = mapOdooFault({ message: "top level msg" });
    expect(err.message).toBe("top level msg");
  });
});

// ---------------------------------------------------------------------------
// 12. httpStatus das classes de erro
// ---------------------------------------------------------------------------
describe("httpStatus das classes de erro", () => {
  it("OdooAccessError.httpStatus === 403", () => {
    expect(new OdooAccessError("x").httpStatus).toBe(403);
  });
  it("OdooValidationError.httpStatus === 422", () => {
    expect(new OdooValidationError("x").httpStatus).toBe(422);
  });
  it("OdooUserError.httpStatus === 422", () => {
    expect(new OdooUserError("x").httpStatus).toBe(422);
  });
  it("OdooMissingError.httpStatus === 404", () => {
    expect(new OdooMissingError("x").httpStatus).toBe(404);
  });
  it("OdooIntegrityError.httpStatus === 422", () => {
    expect(new OdooIntegrityError("x").httpStatus).toBe(422);
  });
  it("OdooNotImplementedError.httpStatus === 422", () => {
    expect(new OdooNotImplementedError("x").httpStatus).toBe(422);
  });
  it("OdooPoolExhaustedError.httpStatus === 502", () => {
    expect(new OdooPoolExhaustedError("x").httpStatus).toBe(502);
  });
  it("OdooUnavailableError.httpStatus === 502", () => {
    expect(new OdooUnavailableError("x").httpStatus).toBe(502);
  });
  it("OdooInternalError.httpStatus === 500", () => {
    expect(new OdooInternalError("x").httpStatus).toBe(500);
  });
});
