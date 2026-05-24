import { sanitizePromptText } from "./sanitize";

describe("sanitizePromptText", () => {
  test("converte em-dash em virgula", () => {
    const out = sanitizePromptText("foo — bar");
    expect(out).toBe("foo , bar".replace(/ +/g, " "));
  });

  test("converte en-dash em virgula", () => {
    expect(sanitizePromptText("a – b")).toBe("a , b".replace(/ +/g, " "));
  });

  test("normaliza reticencias unicode para tres pontos", () => {
    expect(sanitizePromptText("oi…")).toBe("oi...");
  });

  test("aspas francesas viram aspas duplas", () => {
    expect(sanitizePromptText("«oi»")).toBe('"oi"');
  });

  test("non-breaking space vira espaco comum", () => {
    expect(sanitizePromptText("a b")).toBe("a b");
  });

  test("idempotente: sanitizar duas vezes igual sanitizar uma", () => {
    const input = "foo — bar …";
    const a = sanitizePromptText(input);
    const b = sanitizePromptText(a);
    expect(b).toBe(a);
  });

  test("preserva acentos e cedilha", () => {
    const input = "ação, açúcar, coração, lição";
    expect(sanitizePromptText(input)).toBe(input);
  });

  test("preserva quebra de paragrafo (dupla) mas limita 3+ para 2", () => {
    expect(sanitizePromptText("a\n\nb")).toBe("a\n\nb");
    expect(sanitizePromptText("a\n\n\n\nb")).toBe("a\n\nb");
  });
});
