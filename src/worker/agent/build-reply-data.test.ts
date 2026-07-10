import { buildReplyData, type ReplyContext } from "./build-reply-data";
import type { RunAgentResult } from "@/lib/agent/run-agent";

const ctx: ReplyContext = {
  inboundMessageId: "wamid.1",
  to: "5534999",
  businessId: "5932",
  connectionName: "Matrix Group",
  conversationId: "c1",
  messageType: "text",
};

describe("buildReplyData", () => {
  it("ok final mapeia tools/reasoning/usage/model/connectionName", () => {
    const result: RunAgentResult = {
      ok: true,
      message: "resp",
      suggestions: ["a"],
      usage: { tokensInput: 10, tokensOutput: 5, costUsd: 0.01 },
      messageId: "m1",
      toolsCalled: ["faturamento_periodo"],
      reasoningMs: 4200,
      model: "gpt-5-mini",
    };
    const d = buildReplyData(ctx, result);
    expect(d.ok).toBe(true);
    expect(d.reason).toBeNull();
    expect(d.tools).toEqual(["faturamento_periodo"]);
    expect(d.reasoningMs).toBe(4200);
    expect(d.assistantMessageId).toBe("m1");
    expect(d.sessionId).toBe("c1");
    expect(d.usage).toEqual({ tokensInput: 10, tokensOutput: 5, costUsd: 0.01 });
    expect(d.suggestions).toEqual(["a"]);
    expect(d.deniedModule).toBeUndefined();
    // TD.3: modelo efetivo da resposta e nome da conexão viajam no payload.
    expect(d.model).toBe("gpt-5-mini");
    expect(d.connectionName).toBe("Matrix Group");
  });

  it("recusa de permissao vira ok:false/permission_denied com model null", () => {
    const result: RunAgentResult = {
      ok: true,
      message: "recusa",
      suggestions: [],
      usage: { tokensInput: 0, tokensOutput: 0, costUsd: 0 },
      messageId: "m2",
      toolsCalled: [],
      reasoningMs: 0,
      // permission-denial.ts retorna pelo MESMO ramo ok:true sem chamar LLM,
      // por isso `model` é null (SPEC §3.10, resolve I2).
      model: null,
      deniedModule: "financeiro",
      allowedModules: ["estoque"],
    };
    const d = buildReplyData(ctx, result);
    expect(d.ok).toBe(false);
    expect(d.reason).toBe("permission_denied");
    expect(d.deniedModule).toBe("financeiro");
    expect(d.allowedModules).toEqual(["estoque"]);
    expect(d.tools).toEqual([]);
    expect(d.reasoningMs).toBe(0);
    expect(d.suggestions).toEqual([]);
    expect(d.model).toBeNull();
  });

  it("falha técnica vira ok:false/technical_error com model null", () => {
    const result: RunAgentResult = { ok: false, error: "boom" };
    const d = buildReplyData(ctx, result);
    expect(d.ok).toBe(false);
    expect(d.reason).toBe("technical_error");
    expect(d.reasoningMs).toBe(0);
    expect(d.assistantMessageId).toBeNull();
    expect(d.usage).toEqual({ tokensInput: 0, tokensOutput: 0, costUsd: 0 });
    expect(d.model).toBeNull();
    expect(d.connectionName).toBe("Matrix Group");
  });

  it("contexto sem nome de conexão produz connectionName null", () => {
    const result: RunAgentResult = { ok: false, error: "boom" };
    const d = buildReplyData({ ...ctx, connectionName: null }, result);
    expect(d.connectionName).toBeNull();
  });
});
