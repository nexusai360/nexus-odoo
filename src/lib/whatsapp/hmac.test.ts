import { signPayload, verifySignature } from "./hmac";

const SECRET = "test-secret-key-abcdef";
const BODY = JSON.stringify({ messageId: "wamid.123", from: "+5511999999999" });
const NOW = 1_700_000_000_000;
const TS = String(NOW);

describe("signPayload", () => {
  it("retorna string hex de 64 caracteres", () => {
    const sig = signPayload(BODY, SECRET, TS);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("é determinístico para mesmos inputs", () => {
    const a = signPayload(BODY, SECRET, TS);
    const b = signPayload(BODY, SECRET, TS);
    expect(a).toBe(b);
  });

  it("é diferente para segredos distintos", () => {
    const a = signPayload(BODY, "secret1", TS);
    const b = signPayload(BODY, "secret2", TS);
    expect(a).not.toBe(b);
  });

  it("é diferente para timestamps distintos", () => {
    const a = signPayload(BODY, SECRET, "111");
    const b = signPayload(BODY, SECRET, "222");
    expect(a).not.toBe(b);
  });
});

describe("verifySignature", () => {
  it("aceita assinatura válida dentro da janela", () => {
    const sig = signPayload(BODY, SECRET, TS);
    expect(verifySignature(BODY, SECRET, sig, TS, NOW)).toBe(true);
  });

  it("rejeita assinatura inválida", () => {
    expect(verifySignature(BODY, SECRET, "deadbeef".repeat(8), TS, NOW)).toBe(false);
  });

  it("rejeita timestamp mais de 5 min no passado", () => {
    const oldTs = String(NOW - 5 * 60 * 1000 - 1);
    const sig = signPayload(BODY, SECRET, oldTs);
    expect(verifySignature(BODY, SECRET, sig, oldTs, NOW)).toBe(false);
  });

  it("rejeita timestamp mais de 5 min no futuro", () => {
    const futureTs = String(NOW + 5 * 60 * 1000 + 1);
    const sig = signPayload(BODY, SECRET, futureTs);
    expect(verifySignature(BODY, SECRET, sig, futureTs, NOW)).toBe(false);
  });

  it("aceita timestamp exatamente no limite (±5 min)", () => {
    const tsExactLimit = String(NOW - 5 * 60 * 1000);
    const sig = signPayload(BODY, SECRET, tsExactLimit);
    expect(verifySignature(BODY, SECRET, sig, tsExactLimit, NOW)).toBe(true);
  });

  it("rejeita quando body foi adulterado", () => {
    const sig = signPayload(BODY, SECRET, TS);
    const tamperedBody = BODY + "x";
    expect(verifySignature(tamperedBody, SECRET, sig, TS, NOW)).toBe(false);
  });
});
