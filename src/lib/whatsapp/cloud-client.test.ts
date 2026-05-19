/**
 * Testes do cliente da Graph API do WhatsApp Cloud.
 *
 * Usa mock do fetch global para evitar chamadas reais à Graph API.
 * As credenciais são injetadas diretamente nos testes (sem banco).
 */

import { buildCloudClient, type WhatsappCredentials } from "./cloud-client";

const CREDS: WhatsappCredentials = {
  apiToken: "EAAtest...",
  phoneNumberId: "12345678",
};

// ──────────────────────────────────────────────
// Helpers de mock
// ──────────────────────────────────────────────

function mockFetchJson(body: unknown, status = 200) {
  return jest.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
  });
}

function mockFetchBinary(buffer: ArrayBuffer, status = 200) {
  return jest.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
    arrayBuffer: async () => buffer,
  });
}

// ──────────────────────────────────────────────
// sendText
// ──────────────────────────────────────────────

describe("sendText", () => {
  it("faz POST na Graph API com payload correto", async () => {
    const fetchMock = mockFetchJson({ messages: [{ id: "msg_1" }] });
    global.fetch = fetchMock;

    const client = buildCloudClient(CREDS);
    await client.sendText("+5511999999999", "Olá!");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("12345678");
    expect(url).toContain("messages");
    const body = JSON.parse(init.body as string);
    expect(body.to).toBe("+5511999999999");
    expect(body.text.body).toBe("Olá!");
    expect(body.type).toBe("text");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${CREDS.apiToken}`,
    );
  });

  it("lança erro quando a Graph API retorna falha", async () => {
    global.fetch = mockFetchJson({ error: { message: "Invalid token" } }, 401);
    const client = buildCloudClient(CREDS);
    await expect(client.sendText("+5511999999999", "Olá!")).rejects.toThrow();
  });
});

// ──────────────────────────────────────────────
// downloadMedia
// ──────────────────────────────────────────────

describe("downloadMedia", () => {
  it("faz 2 fetches: primeiro busca URL, depois baixa binário", async () => {
    const mediaUrl = "https://cdn.whatsapp.net/v15/media/abc123";
    const audioBuffer = new ArrayBuffer(1024);

    const fetchMock = jest
      .fn()
      // 1º call: busca URL do media
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ url: mediaUrl, mime_type: "audio/ogg; codecs=opus" }),
        arrayBuffer: async () => new ArrayBuffer(0),
      })
      // 2º call: baixa binário
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
        arrayBuffer: async () => audioBuffer,
      });

    global.fetch = fetchMock;

    const client = buildCloudClient(CREDS);
    const result = await client.downloadMedia("media-id-xyz");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    // 1º call deve conter o media-id
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain("media-id-xyz");
    // 2º call deve apontar para a URL retornada
    expect((fetchMock.mock.calls[1] as [string])[0]).toBe(mediaUrl);
    // Resultado deve ser o ArrayBuffer
    expect(result.buffer).toBe(audioBuffer);
    expect(result.mimeType).toBe("audio/ogg; codecs=opus");
  });

  it("lança erro quando o 1º fetch falha", async () => {
    global.fetch = mockFetchJson({ error: { message: "Not found" } }, 404);
    const client = buildCloudClient(CREDS);
    await expect(client.downloadMedia("invalid-id")).rejects.toThrow();
  });

  it("lança erro quando o download binário falha", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ url: "https://cdn.example.com/file", mime_type: "audio/ogg" }),
        arrayBuffer: async () => new ArrayBuffer(0),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({}),
        arrayBuffer: async () => new ArrayBuffer(0),
      });
    global.fetch = fetchMock;

    const client = buildCloudClient(CREDS);
    await expect(client.downloadMedia("media-id")).rejects.toThrow();
  });
});

// ──────────────────────────────────────────────
// Cleanup
// ──────────────────────────────────────────────
afterEach(() => {
  jest.restoreAllMocks();
});
