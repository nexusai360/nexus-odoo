/**
 * Testes do normalizer de tool history.
 */

import { normalizeToolHistory } from "./normalize-tool-history";

describe("normalizeToolHistory", () => {
  it("retorna array vazio quando toolCalls e null", () => {
    expect(normalizeToolHistory(null, null)).toEqual([]);
    expect(normalizeToolHistory(undefined, undefined)).toEqual([]);
  });

  it("retorna array vazio quando toolCalls nao e array", () => {
    expect(normalizeToolHistory("nope", {})).toEqual([]);
    expect(normalizeToolHistory({}, {})).toEqual([]);
  });

  it("normaliza tool calls sem results", () => {
    const calls = [
      { id: "call_1", name: "fiscal_faturamento_periodo", arguments: { periodoDe: "2026-04-01" } },
      { id: "call_2", name: "querySaldoProduto", arguments: { nome: "mola" } },
    ];
    const out = normalizeToolHistory(calls, null);
    expect(out).toEqual([
      { callId: "call_1", name: "fiscal_faturamento_periodo", args: { periodoDe: "2026-04-01" }, result: undefined },
      { callId: "call_2", name: "querySaldoProduto", args: { nome: "mola" }, result: undefined },
    ]);
  });

  it("normaliza tool calls com results parseados", () => {
    const calls = [
      { id: "call_a", name: "queryFaturamento", arguments: { mes: 5 } },
      { id: "call_b", name: "querySaldo", arguments: { id: 42 } },
    ];
    const results = {
      call_a: "{\"total\":12345.67}",
      call_b: "{\"saldo\":10}",
    };
    const out = normalizeToolHistory(calls, results);
    expect(out).toHaveLength(2);
    expect(out[0].result).toBe("{\"total\":12345.67}");
    expect(out[1].result).toBe("{\"saldo\":10}");
  });

  it("ignora entries que nao casam com shape ToolCall", () => {
    const calls = [
      { id: "ok", name: "x", arguments: {} },
      { id: "missing-name", arguments: {} }, // sem name
      "string-invalida",
      null,
    ];
    const out = normalizeToolHistory(calls, {});
    expect(out).toHaveLength(1);
    expect(out[0].callId).toBe("ok");
  });

  it("aceita results parciais (so alguns callIds presentes)", () => {
    const calls = [
      { id: "c1", name: "t1", arguments: {} },
      { id: "c2", name: "t2", arguments: {} },
    ];
    const results = { c1: "resultado-1" }; // c2 ausente
    const out = normalizeToolHistory(calls, results);
    expect(out[0].result).toBe("resultado-1");
    expect(out[1].result).toBeUndefined();
  });

  it("ignora toolResults com shape errado (nao objeto string-only)", () => {
    const calls = [{ id: "c1", name: "t", arguments: {} }];
    expect(normalizeToolHistory(calls, [1, 2, 3])[0].result).toBeUndefined();
    expect(normalizeToolHistory(calls, { c1: 123 })[0].result).toBeUndefined();
  });
});
