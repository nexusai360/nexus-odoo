import { getActiveLlmConfig, getPublicActiveLlmConfig } from "./get-active-config";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    llmConfig: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock("@/lib/encryption", () => ({
  decrypt: jest.fn((v: string) => v.replace("enc:", "")),
}));

const { prisma } = jest.requireMock("@/lib/prisma");

beforeEach(() => jest.clearAllMocks());

describe("getActiveLlmConfig", () => {
  test("retorna config ativa com chave decifrada", async () => {
    prisma.llmConfig.findFirst.mockResolvedValue({
      id: "config-1",
      provider: "anthropic",
      model: "claude-sonnet-4-7",
      credentialId: "cred-1",
      credential: {
        encryptedApiKey: "enc:sk-my-secret-key",
        label: "Prod",
        last4: "ekey",
      },
    });

    const config = await getActiveLlmConfig();
    expect(config).not.toBeNull();
    expect(config!.provider).toBe("anthropic");
    expect(config!.model).toBe("claude-sonnet-4-7");
    expect(config!.apiKey).toBe("sk-my-secret-key");
  });

  test("retorna null quando não há config ativa", async () => {
    prisma.llmConfig.findFirst.mockResolvedValue(null);
    const config = await getActiveLlmConfig();
    expect(config).toBeNull();
  });

  test("lança quando config ativa existe mas sem credencial", async () => {
    prisma.llmConfig.findFirst.mockResolvedValue({
      id: "config-1",
      provider: "openai",
      model: "gpt-4o-mini",
      credentialId: null,
      credential: null,
    });

    await expect(getActiveLlmConfig()).rejects.toThrow(/sem credencial/i);
  });
});

describe("getPublicActiveLlmConfig", () => {
  test("retorna versão mascarada (sem apiKey, com last4)", async () => {
    prisma.llmConfig.findFirst.mockResolvedValue({
      id: "config-1",
      provider: "anthropic",
      model: "claude-sonnet-4-7",
      credentialId: "cred-1",
      credential: {
        encryptedApiKey: "enc:sk-my-secret-key",
        label: "Prod",
        last4: "ekey",
      },
    });

    const pub = await getPublicActiveLlmConfig();
    expect(pub).not.toBeNull();
    expect(pub!.last4).toBe("ekey");
    expect(pub).not.toHaveProperty("apiKey");
  });
});
