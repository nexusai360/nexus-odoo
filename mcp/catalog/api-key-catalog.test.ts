// mcp/catalog/api-key-catalog.test.ts
// TDD para visibleToolsForApiKey (Bloco F , F4).
import { z } from "zod";
import { visibleToolsForApiKey } from "./api-key-catalog.js";
import type { ToolEntry, WriteToolEntry } from "./types.js";
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

function makeReadTool(id: string, dominio?: ToolEntry["dominio"], sempreVisivel?: boolean, addedInVersion?: number): ToolEntry {
  return {
    id,
    dominio,
    descricao: `Tool ${id}`,
    inputSchemaShape: {},
    inputSchema: schema,
    outputSchema: schema,
    sempreVisivel,
    addedInVersion,
    handler: async () => ({}),
  };
}

function makeWriteTool(id: string, module: string, action: string, addedInVersion?: number): WriteToolEntry {
  return {
    id,
    operation: "write",
    module,
    descricao: `Write tool ${id}`,
    inputSchemaShape: {},
    inputSchema: schema,
    outputSchema: schema,
    capability: { module, action },
    sensitive: false,
    odooModel: "some.model",
    eventName: `${id}.done`,
    requiresExternalAuth: true,
    addedInVersion,
    handler: async () => ({ id: 1, data: {}, snapshotBefore: null, snapshotAfter: null }),
  };
}

describe("visibleToolsForApiKey", () => {
  it("retorna tools de leitura cujo módulo está no read da chave", () => {
    const catalog = [
      makeReadTool("saldo_produto", "estoque"),
      makeReadTool("saldo_contas", "financeiro"),
      makeReadTool("nota_fiscal", "fiscal"),
    ];
    const result = visibleToolsForApiKey(catalog, makeApiKey());
    const ids = result.map((t) => t.id);
    expect(ids).toContain("saldo_produto");
    expect(ids).toContain("saldo_contas");
    expect(ids).not.toContain("nota_fiscal");
  });

  it("inclui tool sempreVisivel sem domínio", () => {
    const catalog = [
      makeReadTool("registrar_lacuna", undefined, true),
      makeReadTool("nota_fiscal", "fiscal"),
    ];
    const result = visibleToolsForApiKey(catalog, makeApiKey());
    const ids = result.map((t) => t.id);
    expect(ids).toContain("registrar_lacuna");
    expect(ids).not.toContain("nota_fiscal");
  });

  it("exclui tool sempreVisivel:false sem domínio", () => {
    const catalog = [makeReadTool("sem_dominio", undefined, false)];
    const result = visibleToolsForApiKey(catalog, makeApiKey());
    expect(result).toHaveLength(0);
  });

  it("inclui WriteToolEntry quando capability write está presente", () => {
    const catalog = [makeWriteTool("criar_pedido", "comercial", "create_order")];
    const result = visibleToolsForApiKey(catalog, makeApiKey());
    expect(result.map((t) => t.id)).toContain("criar_pedido");
  });

  it("exclui WriteToolEntry quando módulo não está em write", () => {
    const catalog = [makeWriteTool("criar_nota", "fiscal", "emit_nota")];
    const result = visibleToolsForApiKey(catalog, makeApiKey());
    expect(result).toHaveLength(0);
  });

  it("exclui WriteToolEntry quando ação não está na lista do módulo", () => {
    const catalog = [makeWriteTool("cancelar_pedido", "comercial", "cancel_order")];
    const result = visibleToolsForApiKey(catalog, makeApiKey());
    expect(result).toHaveLength(0);
  });

  it("gate addedInVersion , exclui tool adicionada após versão da chave (read)", () => {
    const catalog = [makeReadTool("nova_tool", "estoque", false, 10)];
    const ctx = makeApiKey({ capabilitiesVersion: 3 });
    expect(visibleToolsForApiKey(catalog, ctx)).toHaveLength(0);
  });

  it("gate addedInVersion , inclui tool adicionada na versão exata (write)", () => {
    const catalog = [makeWriteTool("criar_pedido_v5", "comercial", "create_order", 5)];
    const ctx = makeApiKey({ capabilitiesVersion: 5 });
    expect(visibleToolsForApiKey(catalog, ctx)).toHaveLength(1);
  });

  it("retorna catálogo vazio quando chave sem capabilities", () => {
    const catalog = [
      makeReadTool("saldo_produto", "estoque"),
      makeWriteTool("criar_pedido", "comercial", "create_order"),
    ];
    const ctx = makeApiKey({
      capabilities: { version: 1, read: [], write: {} },
    });
    expect(visibleToolsForApiKey(catalog, ctx)).toHaveLength(0);
  });

  it("catálogo misto , retorna read e write corretos", () => {
    const catalog = [
      makeReadTool("saldo_produto", "estoque"),
      makeReadTool("nota_fiscal", "fiscal"),
      makeWriteTool("criar_pedido", "comercial", "create_order"),
      makeWriteTool("criar_nota", "fiscal", "emit_nota"),
    ];
    const result = visibleToolsForApiKey(catalog, makeApiKey());
    const ids = result.map((t) => t.id);
    expect(ids).toContain("saldo_produto");
    expect(ids).toContain("criar_pedido");
    expect(ids).not.toContain("nota_fiscal");
    expect(ids).not.toContain("criar_nota");
  });
});
