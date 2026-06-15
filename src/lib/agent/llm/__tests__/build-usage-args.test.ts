import { buildUsageArgs, ORIGENS } from "../build-usage-args";
import type { ChatResult } from "../types";

const baseResult: ChatResult = {
  message: "ok",
  usage: { tokensInput: 1000, tokensOutput: 200, tokensCachedInput: 800, costUsd: 0.001 },
  reasoningTokens: 30,
};

describe("buildUsageArgs", () => {
  it("monta LogUsageArgs a partir do ChatResult + contexto + origin", () => {
    const args = buildUsageArgs(
      baseResult,
      {
        provider: "openai",
        model: "gpt-5.4-mini",
        credentialId: "cred-1",
        conversationId: "conv-1",
        userId: "user-1",
        isPlayground: false,
        durationMs: 1234,
      },
      ORIGENS.ENHANCE,
    );
    expect(args).toMatchObject({
      provider: "openai",
      model: "gpt-5.4-mini",
      credentialId: "cred-1",
      conversationId: "conv-1",
      userId: "user-1",
      tokensInput: 1000,
      tokensOutput: 200,
      tokensCachedInput: 800,
      reasoningTokens: 30,
      durationMs: 1234,
      origin: "enhance",
      isPlayground: false,
    });
  });

  it("usa defaults seguros quando campos opcionais faltam", () => {
    const r: ChatResult = { message: "x", usage: { tokensInput: 5, tokensOutput: 1, costUsd: 0 } };
    const args = buildUsageArgs(r, { provider: "openai", model: "m" }, ORIGENS.GUARDRAIL);
    expect(args.tokensCachedInput).toBe(0);
    expect(args.reasoningTokens).toBeNull();
    expect(args.origin).toBe("guardrail");
    expect(args.toolCallsCount).toBe(0);
  });

  it("ORIGENS expoe os 4 papeis", () => {
    expect(ORIGENS).toEqual({
      LOOP: "loop_principal",
      ENHANCE: "enhance",
      GUARDRAIL: "guardrail",
      AUTO_VALIDATOR: "auto_validator",
    });
  });
});
