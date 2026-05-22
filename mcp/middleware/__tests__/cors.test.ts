// mcp/middleware/__tests__/cors.test.ts
import { corsHeaders, handlePreflight } from "../cors";
import type { ApiKeyContext } from "../../auth/api-key-context";

const makeApiKey = (allowedOrigins: string[]): ApiKeyContext => ({
  apiKeyId: "key-1",
  label: "test",
  last4: "AbCd",
  capabilities: { version: 1, read: [], write: {} },
  capabilitiesVersion: 1,
  rateLimit: 60,
  tenantId: null,
  allowedOrigins,
  isSystemKey: false,
});

describe("corsHeaders", () => {
  it("retorna {} sem apiKey", () => {
    expect(corsHeaders({ requestOrigin: "https://app.com" })).toEqual({});
  });

  it("retorna {} sem requestOrigin", () => {
    expect(corsHeaders({ apiKey: makeApiKey(["https://app.com"]) })).toEqual({});
  });

  it("retorna {} quando allowedOrigins vazio (default fechado)", () => {
    expect(
      corsHeaders({ requestOrigin: "https://app.com", apiKey: makeApiKey([]) }),
    ).toEqual({});
  });

  it("retorna headers CORS quando origin está na whitelist", () => {
    const headers = corsHeaders({
      requestOrigin: "https://app.com",
      apiKey: makeApiKey(["https://app.com", "https://other.com"]),
    });
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://app.com");
    expect(headers["Vary"]).toBe("Origin");
    expect(headers["Access-Control-Allow-Methods"]).toContain("POST");
    expect(headers["Access-Control-Allow-Headers"]).toContain("Authorization");
  });

  it("retorna {} quando origin NÃO está na whitelist", () => {
    const headers = corsHeaders({
      requestOrigin: "https://evil.com",
      apiKey: makeApiKey(["https://app.com"]),
    });
    expect(headers).toEqual({});
  });

  it("não adiciona Access-Control-Allow-Origin para origem não listada", () => {
    const headers = corsHeaders({
      requestOrigin: "https://untrusted.com",
      apiKey: makeApiKey(["https://trusted.com"]),
    });
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("headers incluem Idempotency-Key e If-Unmodified-Since", () => {
    const headers = corsHeaders({
      requestOrigin: "https://app.com",
      apiKey: makeApiKey(["https://app.com"]),
    });
    expect(headers["Access-Control-Allow-Headers"]).toContain("Idempotency-Key");
    expect(headers["Access-Control-Allow-Headers"]).toContain("If-Unmodified-Since");
  });
});

describe("handlePreflight", () => {
  it("retorna 204 com headers quando origin permitida", () => {
    const result = handlePreflight({
      requestOrigin: "https://app.com",
      apiKey: makeApiKey(["https://app.com"]),
    });
    expect(result.status).toBe(204);
    expect(result.headers["Access-Control-Allow-Origin"]).toBe("https://app.com");
  });

  it("retorna 403 sem headers quando origin não permitida", () => {
    const result = handlePreflight({
      requestOrigin: "https://evil.com",
      apiKey: makeApiKey(["https://app.com"]),
    });
    expect(result.status).toBe(403);
    expect(result.headers).toEqual({});
  });

  it("retorna 403 sem apiKey", () => {
    const result = handlePreflight({ requestOrigin: "https://app.com" });
    expect(result.status).toBe(403);
  });

  it("retorna 403 com allowedOrigins vazio", () => {
    const result = handlePreflight({
      requestOrigin: "https://app.com",
      apiKey: makeApiKey([]),
    });
    expect(result.status).toBe(403);
  });

  it("preflight bem-sucedido inclui Access-Control-Max-Age", () => {
    const result = handlePreflight({
      requestOrigin: "https://app.com",
      apiKey: makeApiKey(["https://app.com"]),
    });
    expect(result.headers["Access-Control-Max-Age"]).toBeDefined();
  });
});
