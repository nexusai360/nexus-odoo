import { formatarLacunaAmbiguidade } from "../_lacuna";

describe("formatarLacunaAmbiguidade", () => {
  it("formato basico", () =>
    expect(formatarLacunaAmbiguidade("produto", "esteira", 4)).toBe('ambiguidade:produto:"esteira" (4 candidatas)'));

  it("trunca o termo a 80 caracteres", () => {
    const termo = "a".repeat(100);
    expect(formatarLacunaAmbiguidade("produto", termo, 2)).toBe(`ambiguidade:produto:"${"a".repeat(80)}" (2 candidatas)`);
  });

  it("nao truncado quando <= 80", () => {
    const termo = "b".repeat(80);
    expect(formatarLacunaAmbiguidade("nota", termo, 3)).toBe(`ambiguidade:nota:"${termo}" (3 candidatas)`);
  });
});
