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

describe("embedMany() , batch", () => {
  function dims(n: number, fill: number) {
    return Array.from({ length: n }, () => fill);
  }

  test("array vazio → retorna [] sem chamar a API", async () => {
    global.fetch = jest.fn() as jest.Mock;
    const { embedMany } = await import("./embed");
    const r = await embedMany([]);
    expect(r).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("N textos → 1 requisição com input em array, vetores na ordem de entrada", async () => {
    mockSettings([{ key: "embedding_credential_id", value: "cred-uuid-1" }]);
    prisma.llmCredential.findUnique.mockResolvedValue(CRED);
    decrypt.mockReturnValue("sk-key");

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        // Retornado fora de ordem de propósito: o index manda.
        data: [
          { index: 2, embedding: dims(1536, 0.3) },
          { index: 0, embedding: dims(1536, 0.1) },
          { index: 1, embedding: dims(1536, 0.2) },
        ],
        usage: { total_tokens: 30 },
      }),
    });
    global.fetch = fetchMock as jest.Mock;

    const { embedMany } = await import("./embed");
    const r = await embedMany(["a", "b", "c"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.input).toEqual(["a", "b", "c"]);
    expect(r).toHaveLength(3);
    expect(r[0][0]).toBeCloseTo(0.1);
    expect(r[1][0]).toBeCloseTo(0.2);
    expect(r[2][0]).toBeCloseTo(0.3);
  });

  test("API devolve menos vetores que inputs → lança erro", async () => {
    mockSettings([{ key: "embedding_credential_id", value: "cred-uuid-1" }]);
    prisma.llmCredential.findUnique.mockResolvedValue(CRED);
    decrypt.mockReturnValue("sk-key");

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ index: 0, embedding: dims(1536, 0.1) }],
      }),
    }) as jest.Mock;

    const { embedMany } = await import("./embed");
    await expect(embedMany(["a", "b"])).rejects.toThrow(/esperado 2 vetores/i);
  });

  test("dimensão divergente em algum vetor → lança erro", async () => {
    mockSettings([{ key: "embedding_credential_id", value: "cred-uuid-1" }]);
    prisma.llmCredential.findUnique.mockResolvedValue(CRED);
    decrypt.mockReturnValue("sk-key");

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { index: 0, embedding: dims(1536, 0.1) },
          { index: 1, embedding: dims(768, 0.2) },
        ],
      }),
    }) as jest.Mock;

    const { embedMany } = await import("./embed");
    await expect(embedMany(["a", "b"])).rejects.toThrow(/dimensão/i);
  });

  test("mais de 256 inputs → fatiado em múltiplas requisições", async () => {
    mockSettings([{ key: "embedding_credential_id", value: "cred-uuid-1" }]);
    prisma.llmCredential.findUnique.mockResolvedValue(CRED);
    decrypt.mockReturnValue("sk-key");

    const fetchMock = jest.fn().mockImplementation((_url, init) => {
      const body = JSON.parse(init.body);
      const n = body.input.length;
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: body.input.map((_t: string, i: number) => ({
            index: i,
            embedding: dims(1536, 0.5),
          })),
          usage: { total_tokens: n },
        }),
      });
    });
    global.fetch = fetchMock as jest.Mock;

    const { embedMany } = await import("./embed");
    const textos = Array.from({ length: 300 }, (_v, i) => `t${i}`);
    const r = await embedMany(textos);

    expect(r).toHaveLength(300);
    // 300 > 256 → 2 chunks (256 + 44).
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("com usageCtx → 1 linha de consumo somando tokens de todos os chunks", async () => {
    mockSettings([{ key: "embedding_credential_id", value: "cred-uuid-1" }]);
    prisma.llmCredential.findUnique.mockResolvedValue(CRED);
    decrypt.mockReturnValue("sk-key");

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { index: 0, embedding: dims(1536, 0.1) },
          { index: 1, embedding: dims(1536, 0.2) },
        ],
        usage: { total_tokens: 42 },
      }),
    }) as jest.Mock;

    const { embedMany } = await import("./embed");
    await embedMany(["a", "b"], { usage: { origin: "router" } });

    expect(logUsage).toHaveBeenCalledTimes(1);
    expect(logUsage.mock.calls[0][0]).toMatchObject({
      tokensInput: 42,
      requestKind: "embedding",
      origin: "router",
    });
  });

  test("sem credencial → lança EmbeddingUnavailable", async () => {
    mockSettings([]);
    const { embedMany, EmbeddingUnavailable } = await import("./embed");
    await expect(embedMany(["a"])).rejects.toBeInstanceOf(EmbeddingUnavailable);
  });
});
