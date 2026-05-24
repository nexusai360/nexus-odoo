// mcp/lib/__tests__/canonical-json.test.ts
import { canonicalHash } from "../canonical-json";

describe("canonicalHash", () => {
  it("mesmo objeto com chaves reordenadas → mesmo hash", () => {
    const a = { z: 1, a: 2, m: "hello" };
    const b = { a: 2, m: "hello", z: 1 };
    expect(canonicalHash(a)).toBe(canonicalHash(b));
  });

  it("arrays preservam ordem , diferente ordem → hash diferente", () => {
    const arr1 = [1, 2, 3];
    const arr2 = [3, 2, 1];
    expect(canonicalHash(arr1)).not.toBe(canonicalHash(arr2));
  });

  it("arrays com mesma ordem → mesmo hash", () => {
    const arr1 = ["a", "b", "c"];
    const arr2 = ["a", "b", "c"];
    expect(canonicalHash(arr1)).toBe(canonicalHash(arr2));
  });

  it("valores diferentes → hash diferentes", () => {
    expect(canonicalHash({ x: 1 })).not.toBe(canonicalHash({ x: 2 }));
  });

  it("null → hash estável", () => {
    const h = canonicalHash(null);
    expect(h).toBe(canonicalHash(null));
    expect(h).toHaveLength(64);
  });

  it("undefined → hash estável (stringify retorna undefined → usa string vazia)", () => {
    const h = canonicalHash(undefined);
    expect(h).toHaveLength(64);
    expect(h).toBe(canonicalHash(undefined));
  });

  it("objetos aninhados com chaves reordenadas → mesmo hash", () => {
    const a = { outer: { z: true, a: [1, 2] } };
    const b = { outer: { a: [1, 2], z: true } };
    expect(canonicalHash(a)).toBe(canonicalHash(b));
  });

  it("retorna string hex de 64 chars (SHA-256)", () => {
    const h = canonicalHash({ tool: "estoque_modelo", params: { modelo: "Leg Press" } });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
