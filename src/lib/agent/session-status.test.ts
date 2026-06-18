import { isSessionActive } from "./session-status";

const now = Date.now();

describe("isSessionActive", () => {
  it("in_app: ativa enquanto endedAt for null (independente de updatedAt)", () => {
    expect(
      isSessionActive({
        channel: "in_app",
        endedAt: null,
        updatedAt: new Date(now - 100 * 3600e3),
      }),
    ).toBe(true);
  });

  it("whatsapp: ativa só dentro da janela de 24h", () => {
    expect(
      isSessionActive({
        channel: "whatsapp",
        endedAt: null,
        updatedAt: new Date(now - 1 * 3600e3),
      }),
    ).toBe(true);
    expect(
      isSessionActive({
        channel: "whatsapp",
        endedAt: null,
        updatedAt: new Date(now - 25 * 3600e3),
      }),
    ).toBe(false);
  });

  it("encerrada nunca é ativa", () => {
    expect(
      isSessionActive({ channel: "whatsapp", endedAt: new Date(), updatedAt: new Date() }),
    ).toBe(false);
    expect(
      isSessionActive({ channel: "in_app", endedAt: new Date(), updatedAt: new Date() }),
    ).toBe(false);
  });
});
