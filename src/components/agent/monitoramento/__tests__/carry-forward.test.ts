import { describe, it, expect } from "@jest/globals";
import { fillForwardDaily } from "../charts-block";

describe("fillForwardDaily", () => {
  it("mantem o ultimo percentual em dias sem teste (nao cai pra 0)", () => {
    const out = fillForwardDaily([
      { date: "2026-06-01", percent: 100, total: 5 },
      { date: "2026-06-02", percent: null, total: 0 },
      { date: "2026-06-03", percent: null, total: 0 },
    ]);
    expect(out[1]).toMatchObject({ percent: 100, carriedForward: true });
    expect(out[2]).toMatchObject({ percent: 100, carriedForward: true });
  });

  it("atualiza quando ha novo teste no dia", () => {
    const out = fillForwardDaily([
      { date: "2026-06-01", percent: 100, total: 5 },
      { date: "2026-06-02", percent: 80, total: 10 },
      { date: "2026-06-03", percent: null, total: 0 },
    ]);
    expect(out[1]).toMatchObject({ percent: 80, carriedForward: false });
    expect(out[2]).toMatchObject({ percent: 80, carriedForward: true });
  });

  it("dias iniciais sem percentual previo ficam null", () => {
    const out = fillForwardDaily([
      { date: "2026-06-01", percent: null, total: 0 },
      { date: "2026-06-02", percent: 90, total: 3 },
    ]);
    expect(out[0]).toMatchObject({ percent: null, carriedForward: false });
    expect(out[1]).toMatchObject({ percent: 90, carriedForward: false });
  });
});
