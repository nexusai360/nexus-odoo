import { piorou, MIN_AMOSTRA } from "./guard";

const sig = (acertoRate: number, negFeedbackRate: number, amostra: number) => ({
  acertoRate,
  negFeedbackRate,
  amostra,
});

describe("piorou", () => {
  it("amostra insuficiente -> nunca quarentena (no escuro)", () => {
    expect(piorou(sig(0.9, 0.0, 100), sig(0.2, 0.8, MIN_AMOSTRA - 1))).toBe(false);
  });
  it("queda de acerto acima do limiar -> piorou", () => {
    expect(piorou(sig(0.9, 0.0, 50), sig(0.7, 0.0, 20))).toBe(true);
  });
  it("alta de feedback negativo acima do limiar -> piorou", () => {
    expect(piorou(sig(0.9, 0.05, 50), sig(0.9, 0.25, 20))).toBe(true);
  });
  it("estavel -> nao piorou", () => {
    expect(piorou(sig(0.9, 0.05, 50), sig(0.88, 0.07, 30))).toBe(false);
  });
});
