// mcp/dispatcher/check-mode.test.ts
// TDD para checkMode (Bloco F , F5).
import { z } from "zod";
import { checkMode } from "./check-mode.js";
import type { ToolEntry, WriteToolEntry } from "../catalog/types.js";
import type { ApiKeyContext } from "../auth/api-key-context.js";

const schema = z.object({});

function makeApiKey(overrides: Partial<ApiKeyContext> = {}): ApiKeyContext {
  return {
    apiKeyId: "key-1",
    label: "test",
    last4: "abcd",
    capabilities: {
      version: 5,
      read: ["estoque", "financeiro"],
      write: {
        comercial: ["create_order"],
      },
    },
    capabilitiesVersion: 5,
    rateLimit: 60,
    tenantId: null,
    allowedOrigins: [],
    isSystemKey: false,
    ...overrides,
  };
}

function makeReadTool(dominio?: ToolEntry["dominio"], sempreVisivel?: boolean): ToolEntry {
  return {
    id: "saldo_produto",
    dominio,
    descricao: "Consulta saldo",
    inputSchemaShape: {},
    inputSchema: schema,
    outputSchema: schema,
    sempreVisivel,
    handler: async () => ({}),
  };
}

function makeWriteTool(module: string, action: string, addedInVersion?: number): WriteToolEntry {
  return {
    id: "criar_pedido",
    operation: "write",
    module,
    descricao: "Cria pedido",
    inputSchemaShape: {},
    inputSchema: schema,
    outputSchema: schema,
    capability: { module, action },
    sensitive: false,
    odooModel: "sale.order",
    eventName: "order.created",
    requiresExternalAuth: true,
    addedInVersion,
    handler: async () => ({ id: 1, data: {}, snapshotBefore: null, snapshotAfter: null }),
  };
}

describe("checkMode , WriteToolEntry", () => {
  it("nega write tool via auth interna (forbidden_via_internal_auth)", () => {
    const tool = makeWriteTool("comercial", "create_order");
    const result = checkMode(tool, { mode: "internal", userId: "u1" });
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("forbidden_via_internal_auth");
  });

  it("nega write tool via auth externa sem capability (capability_missing)", () => {
    const tool = makeWriteTool("fiscal", "emit_nota");
    const apiKey = makeApiKey(); // não tem write:fiscal
    const result = checkMode(tool, { mode: "external", apiKey });
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("capability_missing");
    expect(result.required).toBe("emit_nota:fiscal");
  });

  it("permite write tool via auth externa com capability correta", () => {
    const tool = makeWriteTool("comercial", "create_order");
    const apiKey = makeApiKey();
    const result = checkMode(tool, { mode: "external", apiKey });
    expect(result.allowed).toBe(true);
    expect(result.errorCode).toBeUndefined();
  });

  it("nega write tool via externa quando addedInVersion > capabilitiesVersion", () => {
    const tool = makeWriteTool("comercial", "create_order", 10);
    const apiKey = makeApiKey({ capabilitiesVersion: 3 });
    const result = checkMode(tool, { mode: "external", apiKey });
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("capability_missing");
  });
});

describe("checkMode , ToolEntry read via auth externa", () => {
  it("permite read tool com domínio na lista de read da chave", () => {
    const tool = makeReadTool("estoque");
    const apiKey = makeApiKey();
    const result = checkMode(tool, { mode: "external", apiKey });
    expect(result.allowed).toBe(true);
  });

  it("nega read tool com domínio fora da lista de read da chave", () => {
    const tool = makeReadTool("fiscal");
    const apiKey = makeApiKey();
    const result = checkMode(tool, { mode: "external", apiKey });
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("capability_missing");
    expect(result.required).toBe("read:fiscal");
  });

  it("permite tool sempreVisivel sem domínio via auth externa", () => {
    const tool = makeReadTool(undefined, true);
    const apiKey = makeApiKey();
    const result = checkMode(tool, { mode: "external", apiKey });
    expect(result.allowed).toBe(true);
  });

  it("nega tool sem domínio e sem sempreVisivel via auth externa", () => {
    const tool = makeReadTool(undefined, false);
    const apiKey = makeApiKey();
    const result = checkMode(tool, { mode: "external", apiKey });
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("capability_missing");
  });
});

describe("checkMode , ToolEntry read via auth interna", () => {
  it("delega ao caller (allowed:true) , validação de role/domínio é da visibleTools legada", () => {
    const tool = makeReadTool("estoque");
    const result = checkMode(tool, { mode: "internal", userId: "u1" });
    expect(result.allowed).toBe(true);
    expect(result.errorCode).toBeUndefined();
  });

  it("tool sempreVisivel via auth interna também retorna allowed:true", () => {
    const tool = makeReadTool(undefined, true);
    const result = checkMode(tool, { mode: "internal", userId: "u1" });
    expect(result.allowed).toBe(true);
  });
});
