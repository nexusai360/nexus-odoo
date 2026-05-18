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
});
