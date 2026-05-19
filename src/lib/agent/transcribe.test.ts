import { transcribeAudio, MAX_AUDIO_BYTES } from "./transcribe";

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

jest.mock("./llm/get-active-config", () => ({
  getActiveLlmConfig: jest.fn(),
}));

const { getActiveLlmConfig } = jest.requireMock("./llm/get-active-config");

beforeEach(() => {
  mockFetch.mockReset();
  jest.clearAllMocks();
});

function makeAudio(sizeBytes = 1000): Blob {
  return new Blob([new Uint8Array(sizeBytes)], { type: "audio/webm" });
}

describe("transcribeAudio", () => {
  test("sem credencial OpenAI ativa → lança TranscriptionUnavailable", async () => {
    getActiveLlmConfig.mockResolvedValue(null);
    await expect(transcribeAudio(makeAudio())).rejects.toThrow(/OpenAI/i);
  });

  test("credencial de provider não-OpenAI → lança TranscriptionUnavailable", async () => {
    getActiveLlmConfig.mockResolvedValue({
      provider: "anthropic",
      model: "claude-sonnet-4-7",
      apiKey: "sk-ant-xxx",
    });
    await expect(transcribeAudio(makeAudio())).rejects.toThrow(/OpenAI/i);
  });

  test("áudio acima de 25MB → lança com mensagem de tamanho", async () => {
    getActiveLlmConfig.mockResolvedValue({
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-xxx",
    });
    const big = makeAudio(MAX_AUDIO_BYTES + 1);
    await expect(transcribeAudio(big)).rejects.toThrow(/25 MB/i);
  });

  test("gpt-4o-mini-transcribe responde OK → retorna texto e tokens", async () => {
    getActiveLlmConfig.mockResolvedValue({
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-xxx",
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        text: "Olá, qual é o saldo do estoque?",
        usage: {
          input_tokens: 50,
          input_token_details: { audio_tokens: 45, text_tokens: 5 },
          output_tokens: 10,
        },
      }),
    } as Response);

    const result = await transcribeAudio(makeAudio());
    expect(result.text).toBe("Olá, qual é o saldo do estoque?");
    expect(result.modelUsed).toBe("gpt-4o-mini-transcribe");
    expect(result.inputTokens).toBe(50); // 45 + 5
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("gpt-4o-mini-transcribe falha → fallback para whisper-1", async () => {
    getActiveLlmConfig.mockResolvedValue({
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-xxx",
    });

    // Primeira chamada (gpt-4o-mini-transcribe) → 500
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "Server error",
    } as Response);

    // Segunda chamada (whisper-1) → OK
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        text: "Transcrição pelo whisper.",
        duration: 3.5,
      }),
    } as Response);

    const result = await transcribeAudio(makeAudio());
    expect(result.text).toBe("Transcrição pelo whisper.");
    expect(result.modelUsed).toBe("whisper-1");
    expect(result.durationSeconds).toBe(3.5);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("whisper-1 também falha → lança erro claro", async () => {
    getActiveLlmConfig.mockResolvedValue({
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-xxx",
    });

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Error 1",
    } as Response);

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      text: async () => "",
    } as Response);

    await expect(transcribeAudio(makeAudio())).rejects.toThrow(/whisper/i);
  });
});
