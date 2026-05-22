jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/encryption", () => ({ decrypt: jest.fn() }));

import {
  slugifyServer,
  prefixedToolName,
  redactArgs,
  isExternalToolName,
} from "./external-mcp";

describe("external-mcp, funções puras", () => {
  it("isExternalToolName distingue tool externa de interna", () => {
    expect(isExternalToolName("ext__gh__create_issue")).toBe(true);
    expect(isExternalToolName("estoque_saldo_produto")).toBe(false);
  });

  it("slugifyServer produz slug minúsculo e alfanumérico", () => {
    const s = slugifyServer("GitHub MCP!", "abcd1234-5678-90ef");
    expect(s).toMatch(/^[a-z0-9]+$/);
    expect(s.startsWith("githubmc")).toBe(true);
  });

  it("slugifyServer dá slugs diferentes para nomes iguais e ids diferentes", () => {
    expect(slugifyServer("Slack", "aaaa0000-1111")).not.toBe(
      slugifyServer("Slack", "bbbb2222-3333"),
    );
  });

  it("prefixedToolName aplica o prefixo e respeita o limite de 60 chars", () => {
    expect(prefixedToolName("gh", "create_issue")).toBe("ext__gh__create_issue");
    const long = prefixedToolName("server12", "a".repeat(80));
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.startsWith("ext__")).toBe(true);
  });

  it("redactArgs redige valores de chaves sensíveis e mantém o resto", () => {
    const out = redactArgs({
      token: "ghp_secreto",
      apiKey: "k",
      password: "123",
      nome: "joão",
    }) as Record<string, unknown>;
    expect(out.token).toBe("[redacted]");
    expect(out.apiKey).toBe("[redacted]");
    expect(out.password).toBe("[redacted]");
    expect(out.nome).toBe("joão");
  });

  it("redactArgs trunca payload grande demais", () => {
    const out = redactArgs({ data: "x".repeat(5000) }) as Record<string, unknown>;
    expect(out._truncated).toBe(true);
  });
});
