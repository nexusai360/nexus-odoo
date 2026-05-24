import {
  dropConversationCache,
  getCachedToolResult,
  setCachedToolResult,
} from "./session-cache";

describe("session-cache", () => {
  const cid = "conv-test-1";

  afterEach(() => dropConversationCache(cid));

  test("miss antes do set", () => {
    expect(getCachedToolResult(cid, "tool_a", {})).toBeNull();
  });

  test("set e get devolvem mesmo valor", () => {
    setCachedToolResult(cid, "tool_a", { x: 1 }, "resultado");
    expect(getCachedToolResult(cid, "tool_a", { x: 1 })).toBe("resultado");
  });

  test("args diferentes nao colidem", () => {
    setCachedToolResult(cid, "tool_a", { x: 1 }, "A");
    setCachedToolResult(cid, "tool_a", { x: 2 }, "B");
    expect(getCachedToolResult(cid, "tool_a", { x: 1 })).toBe("A");
    expect(getCachedToolResult(cid, "tool_a", { x: 2 })).toBe("B");
  });

  test("ordem das chaves nao afeta (canonicalizacao)", () => {
    setCachedToolResult(cid, "tool_a", { a: 1, b: 2 }, "X");
    expect(getCachedToolResult(cid, "tool_a", { b: 2, a: 1 })).toBe("X");
  });

  test("TTL expira", () => {
    setCachedToolResult(cid, "tool_a", {}, "tmp", 5);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(getCachedToolResult(cid, "tool_a", {})).toBeNull();
        resolve();
      }, 20);
    });
  });

  test("conversationId vazio nao crasha", () => {
    expect(getCachedToolResult(null, "tool_a", {})).toBeNull();
    setCachedToolResult(null, "tool_a", {}, "x");
    expect(getCachedToolResult(null, "tool_a", {})).toBeNull();
  });
});
