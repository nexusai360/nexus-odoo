/**
 * TDD , embed.ts
 *
 * Comportamentos testados:
 * - Sem credencial configurada → lança EmbeddingUnavailable
 * - Com credencial → chama API e retorna vetor da dimensão configurada
 * - Vetor com dimensão divergente → lança erro
 * - Erro HTTP → lança erro com status
 * - Com usageCtx → registra consumo via logUsage (origem + modelo + tokens)
 * - Sem usageCtx → não registra consumo
 */

export {}; // isolatedModules: torna o arquivo um módulo

jest.mock("@/lib/prisma", () => ({
  prisma: {
    appSetting: { findMany: jest.fn() },
    llmCredential: { findUnique: jest.fn() },
  },
}));

jest.mock("@/lib/encryption", () => ({
  decrypt: jest.fn((val: string) => val + "_decrypted"),
}));

jest.mock("@/lib/agent/llm/usage-logger", () => ({
  logUsage: jest.fn().mockResolvedValue(undefined),
}));

const { prisma } = jest.requireMock("@/lib/prisma");
const { decrypt } = jest.requireMock("@/lib/encryption");
const { logUsage } = jest.requireMock("@/lib/agent/llm/usage-logger");

/** Helper: configura AppSetting via findMany (credencial + opcionalmente
 *  model/dimensions). */
function mockSettings(rows: Array<{ key: string; value: string }>) {
  prisma.appSetting.findMany.mockResolvedValue(rows);
}

const CRED = {
  id: "cred-uuid-1",
  provider: "openai",
  encryptedApiKey: "sk-enc",
};

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
    mockSettings([]);
    const { embed, EmbeddingUnavailable } = await import("./embed");
    await expect(embed("texto qualquer")).rejects.toBeInstanceOf(
      EmbeddingUnavailable,
    );
  });

  test("AppSetting existe mas credencial não encontrada → lança EmbeddingUnavailable", async () => {
    mockSettings([{ key: "embedding_credential_id", value: "cred-uuid-999" }]);
    prisma.llmCredential.findUnique.mockResolvedValue(null);
    const { embed, EmbeddingUnavailable } = await import("./embed");
    await expect(embed("texto qualquer")).rejects.toBeInstanceOf(
      EmbeddingUnavailable,
    );
  });

  test("com credencial válida → chama API e retorna vetor de 1536 dims (default)", async () => {
    mockSettings([{ key: "embedding_credential_id", value: "cred-uuid-1" }]);
    prisma.llmCredential.findUnique.mockResolvedValue(CRED);
    decrypt.mockReturnValue("sk-real-key");

    const fakeVector = Array.from({ length: 1536 }, () => 0.1);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ embedding: fakeVector }],
        usage: { total_tokens: 7 },
      }),
    }) as jest.Mock;

    const { embed } = await import("./embed");
    const result = await embed("texto de teste");
    expect(result).toHaveLength(1536);
    expect(result[0]).toBeCloseTo(0.1);
    // Sem usageCtx → não registra consumo.
    expect(logUsage).not.toHaveBeenCalled();
  });

  test("dimensão divergente da configurada → lança erro", async () => {
    mockSettings([{ key: "embedding_credential_id", value: "cred-uuid-1" }]);
    prisma.llmCredential.findUnique.mockResolvedValue(CRED);
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
    mockSettings([{ key: "embedding_credential_id", value: "cred-uuid-1" }]);
    prisma.llmCredential.findUnique.mockResolvedValue(CRED);
    decrypt.mockReturnValue("sk-key");

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    }) as jest.Mock;

    const { embed } = await import("./embed");
    await expect(embed("texto")).rejects.toThrow(/401/);
  });

  test("modelo configurado via AppSetting é enviado e usado no log", async () => {
    mockSettings([
      { key: "embedding_credential_id", value: "cred-uuid-1" },
      { key: "embedding_model", value: "text-embedding-3-large" },
      { key: "embedding_dimensions", value: "1536" },
    ]);
    prisma.llmCredential.findUnique.mockResolvedValue(CRED);
    decrypt.mockReturnValue("sk-key");

    const fakeVector = Array.from({ length: 1536 }, () => 0.2);
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ embedding: fakeVector }],
        usage: { total_tokens: 11 },
      }),
    });
    global.fetch = fetchMock as jest.Mock;

    const { embed } = await import("./embed");
    await embed("pergunta", { usage: { origin: "router" } });

    // Corpo da requisição usa o modelo configurado + dimensão.
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("text-embedding-3-large");
    expect(body.dimensions).toBe(1536);

    // usageCtx presente → registra consumo com origem/modelo/tokens.
    expect(logUsage).toHaveBeenCalledTimes(1);
    const logArg = logUsage.mock.calls[0][0];
    expect(logArg).toMatchObject({
      provider: "openai",
      model: "text-embedding-3-large",
      tokensInput: 11,
      tokensOutput: 0,
      requestKind: "embedding",
      origin: "router",
    });
  });
});
