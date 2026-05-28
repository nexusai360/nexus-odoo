import { describe, expect, it } from "@jest/globals";
import { hashKey, normalize } from "../question-normalize";

describe("question-normalize: normalize()", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalize("   ola mundo   ")).toBe("ola mundo");
  });

  it("lowercases unicode", () => {
    expect(normalize("Saldo BANCARIO Ç")).toBe("saldo bancario ç");
  });

  it("collapses multiple internal spaces into one", () => {
    expect(normalize("a     b    c")).toBe("a b c");
  });

  it("removes CR and LF", () => {
    expect(normalize("a\r\nb\nc")).toBe("a b c");
  });

  it("removes zero-width characters", () => {
    // ​ = zero-width space; ‌ = zero-width non-joiner.
    expect(normalize("ola​mundo‌")).toBe("olamundo");
  });

  it("is idempotent", () => {
    const raw = "  Ola  \r\nMundo​  ";
    const once = normalize(raw);
    expect(normalize(once)).toBe(once);
  });

  it("empty string stays empty", () => {
    expect(normalize("")).toBe("");
  });

  it("only whitespace becomes empty", () => {
    expect(normalize("    \r\n\t  ")).toBe("");
  });

  it("preserves accented characters as lowercase", () => {
    expect(normalize("Atenção")).toBe("atenção");
  });

  it("preserves question marks", () => {
    expect(normalize("Qual o saldo do produto X?")).toBe(
      "qual o saldo do produto x?",
    );
  });
});

describe("question-normalize: hashKey()", () => {
  it("is deterministic for same input", () => {
    expect(hashKey("ola mundo")).toBe(hashKey("ola mundo"));
  });

  it("returns 16 hex chars", () => {
    const h = hashKey("teste");
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it("differs for different inputs", () => {
    expect(hashKey("ola mundo")).not.toBe(hashKey("ola world"));
  });
});
