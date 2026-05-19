import { OpenRouterClient } from "./openrouter";

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => mockFetch.mockReset());

describe("OpenRouterClient — MOCK key", () => {
  test("retorna resposta simulada sem chamar fetch", async () => {
    const client = new OpenRouterClient("MOCK_KEY", "openrouter/deepseek/deepseek-chat-v3");
    const result = await client.chat({ messages: [{ role: "user", content: "Olá" }] });
    expect(result.message).toContain("MOCK");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("normaliza model id: remove prefixo openrouter/ antes de enviar à API", async () => {
    // Com chave real o fetch seria chamado — verificar que o body tem o id sem prefixo
    // Usando mock que retorna 200 para capturar o body
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: "assistant", content: "ok" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    } as Response);

    const client = new OpenRouterClient("real_key_1234567890", "openrouter/deepseek/deepseek-chat-v3");
    await client.chat({ messages: [{ role: "user", content: "Olá" }] });

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    // Prefixo "openrouter/" deve ter sido removido
    expect(callBody.model).toBe("deepseek/deepseek-chat-v3");
    expect(callBody.model).not.toContain("openrouter/");
  });
});
