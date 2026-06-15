import { decideRetryOuGap } from "../retry-policy";

describe("decideRetryOuGap", () => {
  it("V1-V5 (redacao/recusa): retry de texto", () => {
    for (const r of ["V1", "V2", "V3", "V4", "V5"] as const) {
      expect(decideRetryOuGap(r)).toBe("retry-texto");
    }
  });

  it("V6/V7 (incoerencia estrutural de dado): Falta Honesta direta", () => {
    expect(decideRetryOuGap("V6")).toBe("falta-honesta");
    expect(decideRetryOuGap("V7")).toBe("falta-honesta");
  });

  it("null (sem problema): nenhuma acao", () => {
    expect(decideRetryOuGap(null)).toBe("nenhuma");
  });
});
