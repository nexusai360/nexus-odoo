import { emitAgentReply } from "./emit-reply";

jest.mock("@/lib/whatsapp/hmac", () => ({ signPayload: jest.fn(() => "sig") }));

describe("emitAgentReply", () => {
  beforeEach(() => {
    (global.fetch as jest.Mock) = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200 });
  });

  it("dispara envelope blocked com reason ao target com secret", async () => {
    await emitAgentReply(
      [{ url: "https://n8n/x", secret: "s1" }],
      {
        kind: "blocked",
        data: {
          ok: false,
          reason: "channel_disabled",
          reply: "msg",
          to: "5534999",
          businessId: null,
          inboundMessageId: "wamid.1",
          sessionId: null,
          assistantMessageId: null,
          suggestions: [],
          tools: [],
          reasoningMs: 0,
          usage: { tokensInput: 0, tokensOutput: 0, costUsd: 0 },
          messageType: "text",
        },
      },
    );
    const fetchMock = global.fetch as jest.Mock;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.event).toBe("agent.reply");
    expect(body.kind).toBe("blocked");
    expect(body.data.reason).toBe("channel_disabled");
    expect(typeof body.deliveryId).toBe("string");
    expect(body.deliveryId.length).toBeGreaterThan(0);
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers["X-Signature"]).toBe("sig");
    expect(typeof headers["X-Timestamp"]).toBe("string");
  });

  it("fail-closed: target sem secret não dispara", async () => {
    await emitAgentReply([{ url: "https://n8n/x", secret: "" }], {
      kind: "blocked",
      data: {
        ok: false,
        reason: "user_not_found",
        reply: "m",
        to: "x",
        businessId: null,
        inboundMessageId: "i",
        sessionId: null,
        assistantMessageId: null,
        suggestions: [],
        tools: [],
        reasoningMs: 0,
        usage: { tokensInput: 0, tokensOutput: 0, costUsd: 0 },
        messageType: "text",
      },
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
