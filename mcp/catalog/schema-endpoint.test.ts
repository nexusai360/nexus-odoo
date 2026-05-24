// mcp/catalog/schema-endpoint.test.ts
// Testes para serializeCatalog e handleCatalogSchemaRequest.

import { z } from "zod";
import type * as http from "node:http";
import { serializeCatalog, handleCatalogSchemaRequest } from "./schema-endpoint.js";
import type { ToolEntry, WriteToolEntry } from "./types.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeReadTool(id: string, dominio?: ToolEntry["dominio"]): ToolEntry {
  return {
    id,
    dominio,
    descricao: `Read tool ${id}`,
    inputSchemaShape: { q: z.string().optional() },
    inputSchema: z.object({ q: z.string().optional() }),
    outputSchema: z.unknown(),
    addedInVersion: 1,
    examples: [{ language: "curl" as const, code: "curl ..." }],
    handler: jest.fn(),
  };
}

function makeWriteTool(id: string, module: string, action: string): WriteToolEntry {
  return {
    id,
    operation: "write",
    module,
    descricao: `Write tool ${id}`,
    inputSchemaShape: { name: z.string() },
    inputSchema: z.object({ name: z.string() }),
    outputSchema: z.unknown(),
    capability: { module, action },
    sensitive: false,
    odooModel: "res.partner",
    eventName: `${module}.${action}`,
    requiresExternalAuth: true,
    addedInVersion: 2,
    examples: [],
    handler: jest.fn(),
  };
}

// ─── serializeCatalog ─────────────────────────────────────────────────────────

describe("serializeCatalog", () => {
  it("serializa read tool com campos corretos", () => {
    const catalog = [makeReadTool("estoque_saldo_produto", "estoque")];
    const result = serializeCatalog(catalog);

    expect(result.tools).toHaveLength(1);
    const tool = result.tools[0];
    expect(tool.id).toBe("estoque_saldo_produto");
    expect(tool.operation).toBe("read");
    expect(tool.module).toBe("estoque");
    expect(tool.capability).toBeNull();
    expect(tool.sensitive).toBe(false);
    expect(tool.addedInVersion).toBe(1);
    expect(tool.inputSchemaKeys).toEqual(["q"]);
    expect(tool.examples).toHaveLength(1);
  });

  it("serializa write tool com campos corretos", () => {
    const catalog = [makeWriteTool("crm.res_partner.create", "crm", "create")];
    const result = serializeCatalog(catalog);

    expect(result.tools).toHaveLength(1);
    const tool = result.tools[0];
    expect(tool.id).toBe("crm.res_partner.create");
    expect(tool.operation).toBe("write");
    expect(tool.module).toBe("crm");
    expect(tool.capability).toBe("create:crm");
    expect(tool.sensitive).toBe(false);
    expect(tool.addedInVersion).toBe(2);
    expect(tool.inputSchemaKeys).toEqual(["name"]);
  });

  it("usa 'outros' como módulo para read tool sem dominio", () => {
    const catalog = [makeReadTool("registrar_lacuna")]; // sem dominio
    const result = serializeCatalog(catalog);
    expect(result.tools[0].module).toBe("outros");
  });

  it("retorna count correto", () => {
    const catalog = [
      makeReadTool("t1", "estoque"),
      makeWriteTool("t2", "crm", "create"),
    ];
    const result = serializeCatalog(catalog);
    expect(result.count).toBe(2);
    expect(result.tools).toHaveLength(2);
  });

  it("retorna catálogo vazio sem erros", () => {
    const result = serializeCatalog([]);
    expect(result.tools).toHaveLength(0);
    expect(result.count).toBe(0);
    expect(result.generatedAt).toBeDefined();
  });

  it("não expõe handler ou schema Zod", () => {
    const catalog = [makeReadTool("t1", "estoque")];
    const result = serializeCatalog(catalog);
    const tool = result.tools[0] as unknown as Record<string, unknown>;
    expect(tool["handler"]).toBeUndefined();
    expect(tool["inputSchema"]).toBeUndefined();
    expect(tool["outputSchema"]).toBeUndefined();
    expect(tool["inputSchemaShape"]).toBeUndefined();
  });

  it("addedInVersion nulo quando ausente", () => {
    const tool = makeReadTool("t1", "estoque");
    delete (tool as Partial<typeof tool>).addedInVersion;
    const result = serializeCatalog([tool]);
    expect(result.tools[0].addedInVersion).toBeNull();
  });
});

// ─── handleCatalogSchemaRequest ───────────────────────────────────────────────

describe("handleCatalogSchemaRequest", () => {
  function makeRes() {
    const headers: Record<string, string> = {};
    let statusCode = 0;
    let body = "";
    const res = {
      writeHead: jest.fn((code: number, hdrs: Record<string, string>) => {
        statusCode = code;
        Object.assign(headers, hdrs);
      }),
      end: jest.fn((data: string) => { body = data; }),
      getStatusCode: () => statusCode,
      getHeaders: () => headers,
      getBody: () => body,
    };
    return res;
  }

  it("responde 200 com Content-Type application/json", () => {
    const res = makeRes();
    const catalog = [makeReadTool("estoque_saldo_produto", "estoque")];

    handleCatalogSchemaRequest(res as unknown as http.ServerResponse, catalog);

    expect(res.getStatusCode()).toBe(200);
    expect(res.getHeaders()["Content-Type"]).toBe("application/json");
  });

  it("body é JSON válido com campo tools", () => {
    const res = makeRes();
    const catalog = [makeReadTool("estoque_saldo_produto", "estoque")];

    handleCatalogSchemaRequest(res as unknown as http.ServerResponse, catalog);

    const json = JSON.parse(res.getBody()) as { tools: unknown[]; count: number };
    expect(json.tools).toHaveLength(1);
    expect(json.count).toBe(1);
  });

  it("inclui Cache-Control header", () => {
    const res = makeRes();
    handleCatalogSchemaRequest(res as unknown as http.ServerResponse, []);
    expect(res.getHeaders()["Cache-Control"]).toBeDefined();
  });

  it("funciona com catálogo vazio", () => {
    const res = makeRes();
    handleCatalogSchemaRequest(res as unknown as http.ServerResponse, []);
    const json = JSON.parse(res.getBody()) as { tools: unknown[]; count: number };
    expect(json.tools).toHaveLength(0);
    expect(json.count).toBe(0);
  });
});
