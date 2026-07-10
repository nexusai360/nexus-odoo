/**
 * TD.4 , Envelope de saída `agent.reply` no formato ANINHADO da SPEC §3.10.
 *
 * O mapeamento plano→aninhado acontece DENTRO de `emitAgentReply`: o
 * `AgentReplyData` continua plano porque o replay o serializa no Redis.
 * Breaking declarado: não há consumidor em produção (SPEC A11).
 */
import { emitAgentReply, type AgentReplyData } from "./emit-reply";

jest.mock("@/lib/whatsapp/hmac", () => ({ signPayload: jest.fn(() => "sig") }));

function dataDeBloqueio(overrides: Partial<AgentReplyData> = {}): AgentReplyData {
  return {
    ok: false,
    reason: "channel_disabled",
    reply: "msg",
    to: "5534999",
    businessId: null,
    connectionName: null,
    model: null,
    inboundMessageId: "wamid.1",
    sessionId: null,
    assistantMessageId: null,
    suggestions: [],
    tools: [],
    reasoningMs: 0,
    usage: { tokensInput: 0, tokensOutput: 0, costUsd: 0 },
    messageType: "text",
    ...overrides,
  };
}

describe("emitAgentReply", () => {
  beforeEach(() => {
    (global.fetch as jest.Mock) = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200 });
  });

  it("emite o envelope aninhado da SPEC §3.10 (connection/message/session/result/diagnostics)", async () => {
    await emitAgentReply(
      [{ url: "https://destino/x", secret: "s1" }],
      {
        kind: "final",
        data: dataDeBloqueio({
          ok: true,
          reason: null,
          reply: "resposta formatada",
          suggestions: ["a", "b"],
          businessId: "5561995630029",
          connectionName: "Matrix Group",
          model: "gpt-5-mini",
          sessionId: "conv-1",
          assistantMessageId: "msg-9",
          tools: ["faturamento_periodo"],
          reasoningMs: 4200,
          usage: { tokensInput: 1200, tokensOutput: 340, costUsd: 0.0021 },
        }),
      },
    );

    const fetchMock = global.fetch as jest.Mock;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(body.event).toBe("agent.reply");
    expect(body.kind).toBe("final");
    expect(typeof body.deliveryId).toBe("string");
    expect(typeof body.timestamp).toBe("number");

    expect(body.connection).toEqual({ name: "Matrix Group", businessId: "5561995630029" });
    expect(body.message).toEqual({
      inboundMessageId: "wamid.1",
      to: "5534999",
      type: "text",
    });
    expect(body.session).toEqual({ conversationId: "conv-1", assistantMessageId: "msg-9" });
    expect(body.result).toEqual({
      ok: true,
      reason: null,
      reply: "resposta formatada",
      suggestions: ["a", "b"],
      deniedModule: null,
      allowedModules: [],
    });
    expect(body.diagnostics).toEqual({
      tools: ["faturamento_periodo"],
      reasoningMs: 4200,
      model: "gpt-5-mini",
      usage: { tokensInput: 1200, tokensOutput: 340, costUsd: 0.0021 },
    });

    // O formato plano antigo NÃO existe mais no envelope.
    expect(body.data).toBeUndefined();

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers["X-Signature"]).toBe("sig");
    expect(typeof headers["X-Timestamp"]).toBe("string");
  });

  it("kind blocked: result carrega reason e model é null", async () => {
    await emitAgentReply(
      [{ url: "https://destino/x", secret: "s1" }],
      { kind: "blocked", data: dataDeBloqueio() },
    );

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.kind).toBe("blocked");
    expect(body.result.ok).toBe(false);
    expect(body.result.reason).toBe("channel_disabled");
    expect(body.diagnostics.model).toBeNull();
    expect(body.connection).toEqual({ name: null, businessId: null });
  });

  it("permission_denied: deniedModule e allowedModules viajam em result", async () => {
    await emitAgentReply(
      [{ url: "https://destino/x", secret: "s1" }],
      {
        kind: "blocked",
        data: dataDeBloqueio({
          reason: "permission_denied",
          deniedModule: "financeiro",
          allowedModules: ["estoque"],
        }),
      },
    );

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.result.deniedModule).toBe("financeiro");
    expect(body.result.allowedModules).toEqual(["estoque"]);
  });

  it("fail-closed: target sem secret não dispara", async () => {
    await emitAgentReply([{ url: "https://destino/x", secret: "" }], {
      kind: "blocked",
      data: dataDeBloqueio({ reason: "user_not_found" }),
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
