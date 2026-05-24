// mcp/lib/__tests__/logger.test.ts
import { maskToken, maskBearerHeader } from "../logger";

describe("maskToken", () => {
  it("mascara string vazia", () => {
    expect(maskToken("")).toBe("****");
  });

  it("mascara string curta (< 4 chars)", () => {
    expect(maskToken("abc")).toBe("****");
  });

  it("mostra apenas primeiros chars e mascara o resto", () => {
    const result = maskToken("supersecrettoken");
    expect(result).toMatch(/^[a-z]{1,4}\*{4}$/);
    expect(result).not.toContain("supersecr");
  });

  it("token de 32 chars , retorna 4 visíveis + ****", () => {
    const token = "a".repeat(32);
    const result = maskToken(token);
    expect(result).toBe("aaaa****");
  });

  it("não vaza o token completo", () => {
    const token = "sk-super-secret-key-12345";
    const result = maskToken(token);
    expect(result.length).toBeLessThan(token.length);
    expect(result).not.toBe(token);
  });
});

describe("maskBearerHeader", () => {
  it("retorna (absent) para undefined", () => {
    expect(maskBearerHeader(undefined)).toBe("(absent)");
  });

  it("mascara header Bearer", () => {
    const result = maskBearerHeader("Bearer supersecrettoken");
    expect(result).toMatch(/^Bearer /);
    expect(result).not.toContain("supersecrettoken");
  });

  it("mascara header sem Bearer prefix", () => {
    const result = maskBearerHeader("rawtoken123456");
    expect(result).not.toBe("rawtoken123456");
    expect(result).toContain("****");
  });
});
