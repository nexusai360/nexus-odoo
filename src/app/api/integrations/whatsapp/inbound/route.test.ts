/**
 * T0.1b , Contrato da rota fixa legada POST /api/integrations/whatsapp/inbound.
 *
 * A rota foi descontinuada em favor do caminho por slug (`/api/webhooks/<slug>`)
 * e passa a responder **410 Gone** com corpo explicativo, sem tocar banco nem
 * fila. A cobertura de comportamento do inbound (auth, barreiras, teto,
 * enfileiramento) vive em `src/lib/whatsapp/slug-inbound.test.ts`.
 *
 * Este teste nasce VERMELHO (TDD): fica verde quando TA.7a trocar o handler.
 */

const mockWebhookFindFirst = jest.fn();
const mockQueueAdd = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    whatsappWebhook: { findFirst: mockWebhookFindFirst },
  },
}));

jest.mock("@/lib/encryption", () => ({
  encrypt: jest.fn((s: string) => `enc:${s}`),
  decrypt: jest.fn((s: string) => s.replace("enc:", "")),
}));

// A rota nova não deve nem importar o handler compartilhado, mas o mock fica
// para o teste falhar de forma legível enquanto a implementação antiga existir.
jest.mock("@/lib/whatsapp/inbound-handler", () => ({
  handleWhatsappInbound: jest.fn().mockResolvedValue(
    new (jest.requireActual("next/server").NextResponse)(null, { status: 202 }),
  ),
}));

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: mockQueueAdd })),
  Worker: jest.fn(),
}));
jest.mock("ioredis", () =>
  jest.fn().mockImplementation(() => ({ on: jest.fn(), connect: jest.fn(), quit: jest.fn() })),
);

import { POST } from "./route";

function makeRequest(): Request {
  return new Request("http://localhost/api/integrations/whatsapp/inbound", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer qualquer-token",
    },
    body: JSON.stringify({ wa_id: "+5511999999999", message_id: "wamid.x", type: "text" }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockWebhookFindFirst.mockResolvedValue({
    id: "wh-1",
    direction: "inbound",
    secret: "enc:mysecret",
    enabled: true,
  });
});

describe("POST /api/integrations/whatsapp/inbound (descontinuada)", () => {
  it("responde 410 Gone", async () => {
    const res = await POST(makeRequest() as Parameters<typeof POST>[0]);
    expect(res.status).toBe(410);
  });

  it("o corpo explica o novo caminho por slug", async () => {
    const res = await POST(makeRequest() as Parameters<typeof POST>[0]);
    const body = await res.json() as { error?: string };
    expect(body.error).toEqual(expect.stringContaining("/api/webhooks/"));
  });

  it("não consulta o banco nem enfileira nada", async () => {
    await POST(makeRequest() as Parameters<typeof POST>[0]);
    expect(mockWebhookFindFirst).not.toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });
});
