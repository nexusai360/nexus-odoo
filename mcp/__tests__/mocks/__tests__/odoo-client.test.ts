// mcp/__tests__/mocks/__tests__/odoo-client.test.ts
//
// Verifica que mockOdooClient() retorna objeto com todos os métodos esperados
// e que cada método é um jest.fn() configurável.

import { mockOdooClient } from "../odoo-client";

const EXISTING_METHODS = [
  "authenticate",
  "version",
  "executeKw",
  "searchReadPaged",
  "searchReadPage",
  "searchIds",
] as const;

const BLOCO_C_METHODS = [
  "create",
  "write",
  "unlink",
  "read",
  "searchRead",
  "fieldsGet",
  "searchIrModelData",
] as const;

const ALL_METHODS = [...EXISTING_METHODS, ...BLOCO_C_METHODS] as const;

describe("mockOdooClient()", () => {
  let client: ReturnType<typeof mockOdooClient>;

  beforeEach(() => {
    client = mockOdooClient();
  });

  it("retorna objeto com todos os métodos esperados", () => {
    for (const method of ALL_METHODS) {
      expect(client).toHaveProperty(method);
    }
  });

  it("cada método é um jest.fn()", () => {
    for (const method of ALL_METHODS) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(jest.isMockFunction((client as any)[method])).toBe(true);
    }
  });

  it("métodos aceitam configuração via mockResolvedValue", async () => {
    client.authenticate.mockResolvedValue(42);
    await expect(client.authenticate()).resolves.toBe(42);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).create.mockResolvedValue(99);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect((client as any).create()).resolves.toBe(99);
  });
});
