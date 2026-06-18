import { signPayload, verifyToken } from "./hmac";

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

describe("verifyToken", () => {
  it("aceita token igual ao secret", () => {
    expect(verifyToken(SECRET, SECRET)).toBe(true);
  });

  it("rejeita token diferente", () => {
    expect(verifyToken("outro-token", SECRET)).toBe(false);
  });

  it("rejeita token vazio", () => {
    expect(verifyToken("", SECRET)).toBe(false);
  });

  it("rejeita secret esperado vazio", () => {
    expect(verifyToken(SECRET, "")).toBe(false);
  });

  it("rejeita quando o comprimento difere (prefixo do secret)", () => {
    expect(verifyToken(SECRET.slice(0, -1), SECRET)).toBe(false);
  });
});
