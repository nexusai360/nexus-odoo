jest.mock("../llm/usage-logger", () => ({ logUsage: jest.fn().mockResolvedValue(undefined) }));
import { logUsage } from "../llm/usage-logger";
import { enhanceWithChips } from "../enhance-chips";

const fakeClient = {
  provider: "openai",
  model: "gpt-5.4-mini",
  chat: jest.fn().mockResolvedValue({
    // chips NAO-vazio: parseEnhanceResponse lanca EnhanceChipsError se chips=[]
    message: JSON.stringify({ cleanMessage: "oi", chips: ["Quer ver os proximos?"] }),
    usage: { tokensInput: 500, tokensOutput: 100, tokensCachedInput: 0, costUsd: 0.0005 },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

it("enhanceWithChips faz await logUsage com origin=enhance quando logCtx e fornecido", async () => {
  await enhanceWithChips({
    client: fakeClient,
    agentResponse: "oi",
    recentHistory: [],
    maxContextual: 3,
    logCtx: { conversationId: "c1", userId: "u1", credentialId: "cred", isPlayground: false },
  });
  expect(logUsage).toHaveBeenCalledTimes(1);
  expect((logUsage as jest.Mock).mock.calls[0][0]).toMatchObject({
    origin: "enhance",
    conversationId: "c1",
    tokensInput: 500,
    tokensOutput: 100,
  });
});
