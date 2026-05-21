// mcp/lib/__tests__/snapshot.test.ts

import { truncateSnapshot } from "../snapshot";

const MAX = 10 * 1024;

describe("truncateSnapshot", () => {
  it("deve retornar objeto igual quando todos os campos estão dentro do limite", () => {
    const input = { id: 1, name: "Acme", active: true };
    const result = truncateSnapshot(input);
    expect(result).toEqual(input);
  });

  it("deve truncar campo string que excede 10KB", () => {
    const big = "x".repeat(MAX + 100);
    const input = { id: 1, blob: big };
    const result = truncateSnapshot(input);
    expect(typeof result.blob).toBe("string");
    expect(result.blob as string).toContain(`...[truncated:${big.length}]`);
    expect((result.blob as string).length).toBeLessThan(big.length);
    // Os primeiros MAX caracteres devem estar presentes
    expect((result.blob as string).startsWith("x".repeat(MAX))).toBe(true);
  });

  it("deve preservar campos não-string intactos", () => {
    const input = { id: 42, active: false, score: 3.14, tags: [1, 2] };
    const result = truncateSnapshot(input);
    expect(result.id).toBe(42);
    expect(result.active).toBe(false);
    expect(result.score).toBeCloseTo(3.14);
    expect(result.tags).toEqual([1, 2]);
  });

  it("não deve mutar o objeto original", () => {
    const big = "y".repeat(MAX + 1);
    const input = { field: big };
    truncateSnapshot(input);
    expect(input.field).toBe(big); // original inalterado
  });

  it("deve truncar apenas campos que excedem o limite, preservando os demais", () => {
    const big = "z".repeat(MAX + 50);
    const small = "a".repeat(MAX - 1);
    const input = { big, small };
    const result = truncateSnapshot(input);
    expect((result.big as string).includes("[truncated:")).toBe(true);
    expect(result.small).toBe(small); // dentro do limite, não trunca
  });

  it("deve incluir o tamanho original no sufixo de truncamento", () => {
    const original = "A".repeat(MAX + 999);
    const input = { data: original };
    const result = truncateSnapshot(input);
    expect(result.data as string).toContain(`[truncated:${original.length}]`);
  });

  it("deve preservar campo string exatamente no limite (não trunca)", () => {
    const exact = "B".repeat(MAX);
    const input = { field: exact };
    const result = truncateSnapshot(input);
    expect(result.field).toBe(exact);
  });
});
