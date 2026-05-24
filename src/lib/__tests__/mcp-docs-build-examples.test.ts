/**
 * @jest-environment jsdom
 */
import { typedPlaceholder } from "@/components/integracoes/servidor-mcp/mcp-docs-content";

describe("typedPlaceholder", () => {
  it("retorna true para boolean", () => {
    expect(typedPlaceholder({ name: "x", type: "boolean", optional: false })).toBe(true);
  });

  it("retorna 1 para integer e number", () => {
    expect(typedPlaceholder({ name: "x", type: "integer", optional: false })).toBe(1);
    expect(typedPlaceholder({ name: "x", type: "number", optional: false })).toBe(1);
  });

  it("retorna YYYY-MM-DD para date e ISO para datetime", () => {
    expect(typedPlaceholder({ name: "d", type: "date", optional: false })).toBe("2026-05-24");
    expect(typedPlaceholder({ name: "d", type: "datetime", optional: false })).toBe("2026-05-24T00:00:00Z");
  });

  it("retorna o primeiro valor do enum quando informado", () => {
    expect(
      typedPlaceholder({ name: "x", type: "enum", optional: false, enumValues: ["a", "b"] }),
    ).toBe("a");
  });

  it("fallback de enum sem valores", () => {
    expect(typedPlaceholder({ name: "x", type: "enum", optional: false })).toBe("<valor>");
  });

  it("retorna placeholder com o nome do campo para string", () => {
    expect(typedPlaceholder({ name: "nomeCliente", type: "string", optional: false })).toBe(
      "<nomeCliente>",
    );
  });

  it("retorna [] para array e {} para object", () => {
    expect(typedPlaceholder({ name: "x", type: "array", optional: false })).toEqual([]);
    expect(typedPlaceholder({ name: "x", type: "object", optional: false })).toEqual({});
  });

  it("retorna <valor> para unknown", () => {
    expect(typedPlaceholder({ name: "x", type: "unknown", optional: false })).toBe("<valor>");
  });
});
