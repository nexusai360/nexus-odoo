// mcp/lib/__tests__/migrate-scopes.test.ts
import { describe, it, expect } from "@jest/globals";
import { parseScopes } from "../migrations/parse-scopes";

describe("parseScopes", () => {
  it("mapeia 'read:<modulo>' para capabilities.read", () => {
    expect(parseScopes(["read:crm", "read:vendas"])).toEqual({
      version: 1,
      read: ["crm", "vendas"],
      write: {},
    });
  });

  it("mapeia 'create:<modulo>' para capabilities.write", () => {
    expect(parseScopes(["create:crm", "create:vendas"])).toEqual({
      version: 1,
      read: [],
      write: { crm: ["create"], vendas: ["create"] },
    });
  });

  it("agrega múltiplas ações no mesmo módulo", () => {
    expect(parseScopes(["create:crm", "update:crm", "delete:crm"])).toEqual({
      version: 1,
      read: [],
      write: { crm: ["create", "update", "delete"] },
    });
  });

  it("ignora scopes mal formatados", () => {
    expect(parseScopes(["invalid", "read:", ":vendas", ""])).toEqual({
      version: 1,
      read: [],
      write: {},
    });
  });

  it("dedup em read e write", () => {
    expect(parseScopes(["read:crm", "read:crm", "create:crm", "create:crm"])).toEqual({
      version: 1,
      read: ["crm"],
      write: { crm: ["create"] },
    });
  });

  it("array vazio gera capabilities vazias", () => {
    expect(parseScopes([])).toEqual({ version: 1, read: [], write: {} });
  });

  it("trata array com não-strings sem quebrar", () => {
    expect(parseScopes([null, undefined, 1, "read:crm"] as unknown as string[])).toEqual({
      version: 1,
      read: ["crm"],
      write: {},
    });
  });
});
