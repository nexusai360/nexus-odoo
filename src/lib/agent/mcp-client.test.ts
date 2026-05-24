/**
 * Testes do cliente MCP do agente.
 *
 * O Client do SDK MCP é mockado , não faz chamadas reais.
 */

import { mcpToolsToProviderTools } from "./mcp-client";
import type { McpTool } from "./mcp-client";

// Mock do SDK para evitar chamadas reais
jest.mock("@modelcontextprotocol/sdk/client", () => ({
  Client: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    listTools: jest.fn().mockResolvedValue({
      tools: [
        {
          name: "estoque_saldo_produto",
          description: "Retorna saldo de produto em estoque.",
          inputSchema: {
            type: "object",
            properties: {
              produto: { type: "string", description: "Nome do produto" },
            },
          },
        },
      ],
    }),
    callTool: jest.fn().mockResolvedValue({
      content: [{ type: "text", text: "Saldo: 10 unidades" }],
    }),
  })),
}));

jest.mock(
  "@modelcontextprotocol/sdk/client/streamableHttp",
  () => ({
    StreamableHTTPClientTransport: jest.fn().mockImplementation(() => ({})),
  }),
);

describe("mcpToolsToProviderTools", () => {
  const mcpTools: McpTool[] = [
    {
      name: "estoque_saldo_produto",
      description: "Retorna saldo de produto em estoque.",
      inputSchema: {
        type: "object",
        properties: {
          produto: { type: "string", description: "Nome do produto" },
        },
      },
    },
    {
      name: "financeiro_saldo_contas",
      description: "Saldo das contas bancárias.",
      inputSchema: { type: "object", properties: {} },
    },
  ];

  test("converte lista de tools MCP para ToolDefinition[]", () => {
    const tools = mcpToolsToProviderTools(mcpTools);
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe("estoque_saldo_produto");
    expect(tools[0].description).toBe("Retorna saldo de produto em estoque.");
    expect(tools[0].parameters).toEqual({
      type: "object",
      properties: {
        produto: { type: "string", description: "Nome do produto" },
      },
    });
  });

  test("lista vazia → array vazio", () => {
    expect(mcpToolsToProviderTools([])).toEqual([]);
  });

  test("preserva inputSchema completo como parameters", () => {
    const tools = mcpToolsToProviderTools([
      {
        name: "minha_tool",
        description: "desc",
        inputSchema: {
          type: "object",
          properties: { x: { type: "number" } },
          required: ["x"],
        },
      },
    ]);
    expect(tools[0].parameters).toHaveProperty("required", ["x"]);
  });
});

describe("createMcpSession", () => {
  beforeEach(() => {
    process.env.MCP_URL = "http://localhost:3001/mcp";
    process.env.MCP_SERVICE_TOKEN = "test-token-123";
  });

  afterEach(() => {
    delete process.env.MCP_URL;
    delete process.env.MCP_SERVICE_TOKEN;
  });

  test("cria sessão com listTools e callTool", async () => {
    const { createMcpSession } = await import("./mcp-client");
    const session = await createMcpSession("user-abc");
    expect(session).toHaveProperty("listTools");
    expect(session).toHaveProperty("callTool");
    expect(session).toHaveProperty("close");

    const tools = await session.listTools();
    expect(Array.isArray(tools)).toBe(true);

    await session.close();
  });

  test("callTool retorna conteúdo normalizado", async () => {
    const { createMcpSession } = await import("./mcp-client");
    const session = await createMcpSession("user-abc");
    const result = await session.callTool("estoque_saldo_produto", { produto: "Bicicleta" });
    expect(typeof result).toBe("string");
    expect(result).toContain("Saldo");
  });

  test("lança quando MCP_URL não está configurado", async () => {
    delete process.env.MCP_URL;
    jest.resetModules();
    const { createMcpSession } = await import("./mcp-client");
    await expect(createMcpSession("user-abc")).rejects.toThrow(/MCP_URL/);
  });
});
