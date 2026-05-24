// mcp/lib/__tests__/crypto.test.ts
import { sha256hex, constantTimeEqual } from "../crypto";
import { createHash } from "node:crypto";

describe("sha256hex", () => {
  it("retorna string hex de 64 chars", () => {
    const result = sha256hex("hello");
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it("é determinístico , mesmo input gera mesmo output", () => {
    const a = sha256hex("token-abc-123");
    const b = sha256hex("token-abc-123");
    expect(a).toBe(b);
  });

  it("inputs diferentes geram outputs diferentes", () => {
    expect(sha256hex("tokenA")).not.toBe(sha256hex("tokenB"));
  });

  it("corresponde ao resultado do node:crypto direto", () => {
    const expected = createHash("sha256").update("test-input", "utf8").digest("hex");
    expect(sha256hex("test-input")).toBe(expected);
  });

  it("string vazia tem hash definido", () => {
    const result = sha256hex("");
    expect(result).toHaveLength(64);
  });
});

describe("constantTimeEqual", () => {
  it("retorna true para buffers iguais", () => {
    const a = Buffer.from("abc");
    const b = Buffer.from("abc");
    expect(constantTimeEqual(a, b)).toBe(true);
  });

  it("retorna false para buffers diferentes de mesmo tamanho", () => {
    const a = Buffer.from("abc");
    const b = Buffer.from("xyz");
    expect(constantTimeEqual(a, b)).toBe(false);
  });

  it("retorna false para buffers de tamanhos diferentes", () => {
    const a = Buffer.from("ab");
    const b = Buffer.from("abc");
    expect(constantTimeEqual(a, b)).toBe(false);
  });
});
