// mcp/catalog/types.test.ts
// Tests for WriteToolEntry, ToolEntryExample, and isWriteToolEntry (Bloco F , F1/F2).
import { z } from "zod";
import {
  isWriteToolEntry,
  type WriteToolEntry,
  type ToolEntry,
  type ToolEntryExample,
} from "./types.js";

const schema = z.object({});

function makeWriteTool(overrides: Partial<WriteToolEntry> = {}): WriteToolEntry {
  return {
    id: "criar_pedido",
    operation: "write",
    module: "comercial",
    descricao: "Cria pedido de venda",
    inputSchemaShape: {},
    inputSchema: schema,
    outputSchema: schema,
    capability: { module: "comercial", action: "create_order" },
    sensitive: false,
    odooModel: "sale.order",
    eventName: "order.created",
    requiresExternalAuth: true,
    handler: async () => ({
      id: 1,
      data: {},
      snapshotBefore: null,
      snapshotAfter: null,
    }),
    ...overrides,
  };
}

function makeReadTool(): ToolEntry {
  return {
    id: "saldo_produto",
    dominio: "estoque",
    descricao: "Consulta saldo de produto",
    inputSchemaShape: {},
    inputSchema: schema,
    outputSchema: schema,
    handler: async () => ({}),
  };
}

describe("isWriteToolEntry", () => {
  it("retorna true para WriteToolEntry válida", () => {
    expect(isWriteToolEntry(makeWriteTool())).toBe(true);
  });

  it("retorna false para ToolEntry de leitura (sem operation)", () => {
    expect(isWriteToolEntry(makeReadTool())).toBe(false);
  });

  it("retorna false para null", () => {
    expect(isWriteToolEntry(null)).toBe(false);
  });

  it("retorna false para undefined", () => {
    expect(isWriteToolEntry(undefined)).toBe(false);
  });

  it("retorna false para objeto sem operation", () => {
    expect(isWriteToolEntry({ id: "foo" })).toBe(false);
  });

  it("retorna false para operation diferente de 'write'", () => {
    expect(isWriteToolEntry({ id: "foo", operation: "read" })).toBe(false);
  });
});

describe("WriteToolEntry , campos opcionais", () => {
  it("aceita addedInVersion e examples opcionais", () => {
    const example: ToolEntryExample = {
      language: "curl",
      description: "Exemplo básico",
      code: 'curl -X POST https://api.example.com/mcp -H "Authorization: Bearer TOKEN"',
    };
    const tool = makeWriteTool({
      addedInVersion: 2,
      examples: [example],
      affectsModels: ["stock.move"],
    });
    expect(tool.addedInVersion).toBe(2);
    expect(tool.examples).toHaveLength(1);
    expect(tool.examples?.[0]?.language).toBe("curl");
    expect(tool.affectsModels).toContain("stock.move");
  });
});

describe("ToolEntry , novos campos opcionais (F1)", () => {
  it("aceita addedInVersion, examples e requiresExternalAuth opcionais", () => {
    const tool: ToolEntry = {
      ...makeReadTool(),
      addedInVersion: 3,
      requiresExternalAuth: true,
      examples: [{ language: "python", code: "import mcp" }],
    };
    expect(tool.addedInVersion).toBe(3);
    expect(tool.requiresExternalAuth).toBe(true);
    expect(tool.examples).toHaveLength(1);
  });
});
