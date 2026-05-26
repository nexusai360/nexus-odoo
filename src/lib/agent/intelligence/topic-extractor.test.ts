/**
 * Testes do topic-extractor.
 */

jest.mock("server-only", () => ({}));

const mockChat = jest.fn();
jest.mock("@/lib/agent/llm/get-active-config", () => ({
  getActiveLlmConfig: jest.fn().mockResolvedValue({
    id: "cfg-1",
    provider: "openrouter",
    model: "anthropic/claude-haiku-4-5",
    apiKey: "sk-test",
    credentialId: "c-1",
    credentialLabel: "test",
  }),
}));
jest.mock("@/lib/agent/llm/get-client", () => ({
  buildLlmClient: jest.fn(() => ({ chat: mockChat })),
}));

import { extractTopics } from "./topic-extractor";

describe("extractTopics", () => {
  beforeEach(() => {
    mockChat.mockReset();
  });

  it("retorna FALLBACK quando lista de mensagens vazia", async () => {
    const out = await extractTopics([]);
    expect(out).toEqual({ topic: "outros", domain: "outros", keywords: [] });
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("parseia resposta JSON valida", async () => {
    mockChat.mockResolvedValue({
      message: JSON.stringify({
        topic: "saldo de produto",
        domain: "estoque",
        keywords: ["saldo", "produto", "mola"],
      }),
      usage: { tokensInput: 100, tokensOutput: 20, costUsd: 0 },
    });

    const out = await extractTopics(["Quanto temos de mola espiral?"]);
    expect(out.topic).toBe("saldo de produto");
    expect(out.domain).toBe("estoque");
    expect(out.keywords).toEqual(["saldo", "produto", "mola"]);
  });

  it("normaliza dominio desconhecido para outros", async () => {
    mockChat.mockResolvedValue({
      message: JSON.stringify({
        topic: "x",
        domain: "marketing-digital", // nao esta nos KNOWN_DOMAINS
        keywords: [],
      }),
      usage: { tokensInput: 1, tokensOutput: 1, costUsd: 0 },
    });

    const out = await extractTopics(["q"]);
    expect(out.domain).toBe("outros");
  });

  it("cap keywords em 4", async () => {
    mockChat.mockResolvedValue({
      message: JSON.stringify({
        topic: "t",
        domain: "estoque",
        keywords: ["a", "b", "c", "d", "e", "f"],
      }),
      usage: { tokensInput: 1, tokensOutput: 1, costUsd: 0 },
    });

    const out = await extractTopics(["q"]);
    expect(out.keywords).toEqual(["a", "b", "c", "d"]);
  });

  it("FALLBACK quando JSON invalido", async () => {
    mockChat.mockResolvedValue({
      message: "isso nao e JSON",
      usage: { tokensInput: 1, tokensOutput: 1, costUsd: 0 },
    });

    const out = await extractTopics(["q"]);
    expect(out.topic).toBe("outros");
  });

  it("FALLBACK quando LLM lanca", async () => {
    mockChat.mockRejectedValue(new Error("timeout"));
    const out = await extractTopics(["q"]);
    expect(out.topic).toBe("outros");
  });

  it("extrai JSON envelopado em markdown code fence", async () => {
    mockChat.mockResolvedValue({
      message:
        "```json\n" +
        JSON.stringify({ topic: "x", domain: "fiscal", keywords: ["y"] }) +
        "\n```",
      usage: { tokensInput: 1, tokensOutput: 1, costUsd: 0 },
    });

    const out = await extractTopics(["q"]);
    expect(out.topic).toBe("x");
    expect(out.domain).toBe("fiscal");
  });
});
