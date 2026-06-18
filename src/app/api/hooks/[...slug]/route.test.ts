/**
 * Testes da rota por slug /api/hooks/<slug> (F5.1).
 */

const mockFindFirst = jest.fn();
const mockHandle = jest.fn();
const mockDecrypt = jest.fn((s: string) => s.replace("enc:", ""));

jest.mock("@/lib/prisma", () => ({
  prisma: { whatsappWebhook: { findFirst: mockFindFirst } },
}));
jest.mock("@/lib/encryption", () => ({ decrypt: mockDecrypt }));
jest.mock("@/lib/whatsapp/inbound-handler", () => ({
  handleWhatsappInbound: mockHandle,
}));

import { POST } from "./route";

function req(): Request {
  return new Request("http://localhost/api/hooks/loja1", { method: "POST", body: "{}" });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHandle.mockResolvedValue(
    new Response(JSON.stringify({ queued: true }), { status: 202 }),
  );
});

describe("POST /api/hooks/<slug>", () => {
  it("404 quando não há webhook de WhatsApp para o slug", async () => {
    mockFindFirst.mockResolvedValue(null);
    const res = await POST(req() as Parameters<typeof POST>[0], {
      params: Promise.resolve({ slug: ["loja1"] }),
    });
    expect(res.status).toBe(404);
    expect(mockHandle).not.toHaveBeenCalled();
  });

  it("delega ao handler com secret descifrado + business_id quando encontra", async () => {
    mockFindFirst.mockResolvedValue({ secret: "enc:s1", businessId: "556195630029" });
    const res = await POST(req() as Parameters<typeof POST>[0], {
      params: Promise.resolve({ slug: ["loja1"] }),
    });
    expect(res.status).toBe(202);
    expect(mockHandle).toHaveBeenCalledWith(
      expect.anything(),
      { secret: "s1", businessId: "556195630029" },
    );
    // Resolve o webhook pelo path montado a partir do slug.
    expect(mockFindFirst.mock.calls[0][0].where).toEqual(
      expect.objectContaining({
        direction: "inbound",
        enabled: true,
        isWhatsappReceiver: true,
        path: "loja1",
      }),
    );
  });
});
