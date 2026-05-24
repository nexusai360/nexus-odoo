// mcp/auth/service-token.test.ts
import { validateServiceToken } from "./service-token.js";

const VALID_TOKEN = "test-secret-token-abc123";

describe("validateServiceToken", () => {
  const originalEnv = process.env.MCP_SERVICE_TOKEN;

  beforeEach(() => {
    process.env.MCP_SERVICE_TOKEN = VALID_TOKEN;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.MCP_SERVICE_TOKEN;
    } else {
      process.env.MCP_SERVICE_TOKEN = originalEnv;
    }
  });

  it("retorna true para token correto", () => {
    expect(validateServiceToken(`Bearer ${VALID_TOKEN}`)).toBe(true);
  });

  it("retorna false para token errado", () => {
    expect(validateServiceToken("Bearer wrong-token")).toBe(false);
  });

  it("retorna false para header ausente", () => {
    expect(validateServiceToken(undefined)).toBe(false);
  });

  it("retorna false para header malformado (sem Bearer)", () => {
    expect(validateServiceToken(VALID_TOKEN)).toBe(false);
  });

  it("retorna false quando MCP_SERVICE_TOKEN não está no ambiente", () => {
    delete process.env.MCP_SERVICE_TOKEN;
    expect(validateServiceToken(`Bearer ${VALID_TOKEN}`)).toBe(false);
  });

  it("retorna false quando MCP_SERVICE_TOKEN é string vazia", () => {
    process.env.MCP_SERVICE_TOKEN = "";
    expect(validateServiceToken(`Bearer ${VALID_TOKEN}`)).toBe(false);
  });

  it("retorna false para token com comprimento muito diferente do esperado (não vaza via timing)", () => {
    // Token fornecido muito mais curto que o esperado , o createHash neutraliza
    // o vazamento de comprimento: ambos os lados viram buffers de 32 bytes.
    expect(validateServiceToken("Bearer x")).toBe(false);
    // Token fornecido muito mais longo que o esperado
    expect(validateServiceToken(`Bearer ${"a".repeat(512)}`)).toBe(false);
  });
});
