import { WELCOME_SUGGESTIONS } from "./welcome-suggestions";

describe("WELCOME_SUGGESTIONS", () => {
  test("contem exatamente 4 sugestoes", () => {
    expect(WELCOME_SUGGESTIONS).toHaveLength(4);
  });

  test("nenhuma sugestao contem travessao ou en-dash", () => {
    for (const s of WELCOME_SUGGESTIONS) {
      expect(s).not.toMatch(/[,,]/);
    }
  });

  test("toda sugestao termina com sinal de interrogacao", () => {
    for (const s of WELCOME_SUGGESTIONS) {
      expect(s.trim().endsWith("?")).toBe(true);
    }
  });
});
