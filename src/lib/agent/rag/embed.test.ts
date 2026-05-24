/**
 * TDD , embed.ts
 *
 * Comportamentos testados:
 * - Sem credencial configurada → lança EmbeddingUnavailable
 * - Com credencial → chama API e retorna vetor de 1536 dimensões
 * - Vetor com dimensão ≠ 1536 → lança erro
 */

export {}; // isolatedModules: torna o arquivo um módulo

jest.mock("@/lib/prisma", () => ({
  prisma: {
    appSetting: { findUnique: jest.fn() },
    llmCredential: { findUnique: jest.fn() },
  },
}));

jest.mock("@/lib/encryption", () => ({
  decrypt: jest.fn((val: string) => val + "_decrypted"),
}));

const { prisma } = jest.requireMock("@/lib/prisma");
const { decrypt } = jest.requireMock("@/lib/encryption");

// Reset mocks entre testes
beforeEach(() => {
  jest.clearAllMocks();
});

describe("EmbeddingUnavailable", () => {
  test("é exportado como classe de erro", async () => {
    const { EmbeddingUnavailable } = await import("./embed");
    expect(EmbeddingUnavailable).toBeDefined();
    const err = new EmbeddingUnavailable("sem cred");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("EmbeddingUnavailable");
  });
});

describe("embed()", () => {
  test("sem AppSetting embedding_credential_id → lança EmbeddingUnavailable", async () => {
    prisma.appSetting.findUnique.mockResolvedValue(null);
    const { embed, EmbeddingUnavailable } = await import("./embed");
    await expect(embed("texto qualquer")).rejects.toBeInstanceOf(EmbeddingUnavailable);
  });

  test("AppSetting existe mas credencial não encontrada → lança EmbeddingUnavailable", async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ key: "embedding_credential_id", value: "cred-uuid-999" });
    prisma.llmCredential.findUnique.mockResolvedValue(null);
    const { embed, EmbeddingUnavailable } = await import("./embed");
    await expect(embed("texto qualquer")).rejects.toBeInstanceOf(EmbeddingUnavailable);
  });

  test("com credencial válida → chama API e retorna vetor de 1536 dims", async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ key: "embedding_credential_id", value: "cred-uuid-1" });
    prisma.llmCredential.findUnique.mockResolvedValue({
      id: "cred-uuid-1",
      provider: "openai",
      encryptedApiKey: "sk-encrypted",
    });
    decrypt.mockReturnValue("sk-real-key");

    const fakeVector = Array.from({ length: 1536 }, () => 0.1);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: fakeVector }] }),
    }) as jest.Mock;

    const { embed } = await import("./embed");
    const result = await embed("texto de teste");
    expect(result).toHaveLength(1536);
    expect(result[0]).toBeCloseTo(0.1);
  });

  test("API retorna vetor de dimensão ≠ 1536 → lança erro", async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ key: "embedding_credential_id", value: "cred-uuid-1" });
    prisma.llmCredential.findUnique.mockResolvedValue({
      id: "cred-uuid-1",
      provider: "openai",
      encryptedApiKey: "sk-enc",
    });
    decrypt.mockReturnValue("sk-key");

    const wrongVector = Array.from({ length: 768 }, () => 0.5);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: wrongVector }] }),
    }) as jest.Mock;

    const { embed } = await import("./embed");
    await expect(embed("texto")).rejects.toThrow(/dimensão/i);
  });

  test("API retorna erro HTTP → lança erro com status", async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ key: "embedding_credential_id", value: "cred-uuid-1" });
    prisma.llmCredential.findUnique.mockResolvedValue({
      id: "cred-uuid-1",
      provider: "openai",
      encryptedApiKey: "sk-enc",
    });
    decrypt.mockReturnValue("sk-key");

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    }) as jest.Mock;

    const { embed } = await import("./embed");
    await expect(embed("texto")).rejects.toThrow(/401/);
  });
});
