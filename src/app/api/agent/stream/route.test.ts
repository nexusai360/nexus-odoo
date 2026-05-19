/**
 * Testes para o endpoint SSE /api/agent/stream.
 * TDD: escritos antes da implementação (Task 3.2).
 *
 * Estratégia (G8 do plano):
 * - runAgent mockado que chama onEvent numa ordem conhecida.
 * - O teste lê response.body como stream e asserta a sequência de eventos.
 */

// Mocks
jest.mock("server-only", () => ({}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/headers", () => ({
  headers: jest.fn(() => new Map()),
}));

jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("@/lib/agent/run-agent", () => ({
  runAgent: jest.fn(),
}));

jest.mock("@/lib/agent/conversation", () => ({
  createConversation: jest.fn(),
  assertConversationOwned: jest.fn(),
}));

const { getCurrentUser } = jest.requireMock("@/lib/auth");
const { runAgent } = jest.requireMock("@/lib/agent/run-agent");
const { createConversation } = jest.requireMock("@/lib/agent/conversation");

import { POST } from "./route";

const MOCK_USER = { id: "user-123", platformRole: "admin", name: "Admin", email: "a@test.com" };
const MOCK_CONV_ID = "conv-abc";

async function collectSSE(body: ReadableStream<Uint8Array>): Promise<string[]> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const events: string[] = [];
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
  }

  for (const line of buf.split("\n")) {
    if (line.startsWith("data: ")) {
      events.push(line.slice(6).trim());
    }
  }

  return events;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/agent/stream", () => {
  it("retorna 401 quando não autenticado", async () => {
    getCurrentUser.mockResolvedValue(null);

    const req = new Request("http://localhost/api/agent/stream", {
      method: "POST",
      body: JSON.stringify({ message: "Olá" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("cria conversa in_app quando conversationId ausente", async () => {
    getCurrentUser.mockResolvedValue(MOCK_USER);
    createConversation.mockResolvedValue({ id: MOCK_CONV_ID });
    runAgent.mockImplementation(async ({ onEvent }: { onEvent?: (e: unknown) => void }) => {
      onEvent?.({ type: "thinking" });
      onEvent?.({ type: "done" });
      return { ok: true, message: "Resposta", suggestions: [], usage: { tokensInput: 10, tokensOutput: 5, costUsd: 0 } };
    });

    const req = new Request("http://localhost/api/agent/stream", {
      method: "POST",
      body: JSON.stringify({ message: "Olá" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(createConversation).toHaveBeenCalledWith(MOCK_USER.id, "in_app");
  });

  it("emite eventos status → done na ordem correta", async () => {
    getCurrentUser.mockResolvedValue(MOCK_USER);
    createConversation.mockResolvedValue({ id: MOCK_CONV_ID });
    runAgent.mockImplementation(async ({ onEvent }: { onEvent?: (e: { type: string; toolName?: string }) => void }) => {
      onEvent?.({ type: "thinking" });
      onEvent?.({ type: "tool_call", toolName: "estoque_saldo_produto" });
      onEvent?.({ type: "done" });
      return {
        ok: true,
        message: "Resposta final",
        suggestions: ["Pergunta 1", "Pergunta 2"],
        usage: { tokensInput: 10, tokensOutput: 5, costUsd: 0 },
      };
    });

    const req = new Request("http://localhost/api/agent/stream", {
      method: "POST",
      body: JSON.stringify({ message: "Quantos itens no estoque?" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const events = await collectSSE(res.body as ReadableStream<Uint8Array>);
    const parsed = events.map((e) => JSON.parse(e) as Record<string, unknown>);

    const types = parsed.map((e) => e.type);
    expect(types[0]).toBe("status");
    expect(types[1]).toBe("tool_call");

    const doneEvt = parsed.find((e) => e.type === "done");
    expect(doneEvt).toBeDefined();
    expect(doneEvt!.message).toBe("Resposta final");
    expect(doneEvt!.suggestions).toEqual(["Pergunta 1", "Pergunta 2"]);
  });

  it("retorna 400 quando message está ausente", async () => {
    getCurrentUser.mockResolvedValue(MOCK_USER);

    const req = new Request("http://localhost/api/agent/stream", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
