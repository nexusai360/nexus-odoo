/**
 * Testes para o endpoint SSE /api/agent/stream.
 *
 * RBAC v2: gate via `requireAgentAccessOrJson` (401/403 JSON). Playground
 * mantém check adicional de PLAYGROUND_ROLES (admin/super_admin).
 */

import { NextResponse } from "next/server";

jest.mock("server-only", () => ({}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/headers", () => ({
  headers: jest.fn(() => new Map()),
}));

jest.mock("@/lib/auth/require", () => ({
  requireAgentAccessOrJson: jest.fn(),
}));

jest.mock("@/lib/agent/run-agent", () => ({
  runAgent: jest.fn(),
}));

jest.mock("@/lib/agent/conversation", () => ({
  createConversation: jest.fn(),
  assertConversationOwned: jest.fn(),
}));

const { requireAgentAccessOrJson } = jest.requireMock("@/lib/auth/require");
const { runAgent } = jest.requireMock("@/lib/agent/run-agent");
const { createConversation } = jest.requireMock("@/lib/agent/conversation");

import { POST } from "./route";

const MOCK_USER_ADMIN = {
  id: "user-admin",
  platformRole: "admin",
  name: "Admin",
  email: "a@test.com",
};
const MOCK_USER_VIEWER = {
  id: "user-viewer",
  platformRole: "viewer",
  name: "Viewer",
  email: "v@test.com",
};
const MOCK_CONV_ID = "conv-abc";

function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
function agentNotEnabledResponse() {
  return NextResponse.json({ error: "AgentNotEnabled" }, { status: 403 });
}

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
    requireAgentAccessOrJson.mockResolvedValue(unauthorizedResponse());

    const req = new Request("http://localhost/api/agent/stream", {
      method: "POST",
      body: JSON.stringify({ message: "Olá" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("retorna 403 AgentNotEnabled para viewer sem domínio", async () => {
    requireAgentAccessOrJson.mockResolvedValue(agentNotEnabledResponse());

    const req = new Request("http://localhost/api/agent/stream", {
      method: "POST",
      body: JSON.stringify({ message: "Olá" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("AgentNotEnabled");
  });

  it("viewer com domínio + isPlayground=true recebe 403 Forbidden (PLAYGROUND_ROLES)", async () => {
    requireAgentAccessOrJson.mockResolvedValue({
      user: MOCK_USER_VIEWER,
      allowedDomains: new Set(["estoque"]),
    });

    const req = new Request("http://localhost/api/agent/stream", {
      method: "POST",
      body: JSON.stringify({ message: "Teste", isPlayground: true }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/playground/i);
  });

  it("cria conversa in_app quando conversationId ausente", async () => {
    requireAgentAccessOrJson.mockResolvedValue({
      user: MOCK_USER_ADMIN,
      allowedDomains: "all",
    });
    createConversation.mockResolvedValue({ id: MOCK_CONV_ID });
    runAgent.mockImplementation(
      async ({ onEvent }: { onEvent?: (e: unknown) => void }) => {
        onEvent?.({ type: "thinking" });
        onEvent?.({ type: "done" });
        return {
          ok: true,
          message: "Resposta",
          suggestions: [],
          usage: { tokensInput: 10, tokensOutput: 5, costUsd: 0 },
        };
      },
    );

    const req = new Request("http://localhost/api/agent/stream", {
      method: "POST",
      body: JSON.stringify({ message: "Olá" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(createConversation).toHaveBeenCalledWith(MOCK_USER_ADMIN.id, "in_app");
  });

  it("emite eventos status → done na ordem correta", async () => {
    requireAgentAccessOrJson.mockResolvedValue({
      user: MOCK_USER_ADMIN,
      allowedDomains: "all",
    });
    createConversation.mockResolvedValue({ id: MOCK_CONV_ID });
    runAgent.mockImplementation(
      async ({
        onEvent,
      }: {
        onEvent?: (e: { type: string; toolName?: string }) => void;
      }) => {
        onEvent?.({ type: "thinking" });
        onEvent?.({ type: "tool_call", toolName: "estoque_saldo_produto" });
        onEvent?.({ type: "done" });
        return {
          ok: true,
          message: "Resposta final",
          suggestions: ["Pergunta 1", "Pergunta 2"],
          usage: { tokensInput: 10, tokensOutput: 5, costUsd: 0 },
        };
      },
    );

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
    requireAgentAccessOrJson.mockResolvedValue({
      user: MOCK_USER_ADMIN,
      allowedDomains: "all",
    });

    const req = new Request("http://localhost/api/agent/stream", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
