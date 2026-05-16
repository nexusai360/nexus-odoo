import { generateTempPassword, TEMP_PASSWORD_CHARS } from "@/lib/temp-password";

describe("generateTempPassword", () => {
  it("gera 12 caracteres por padrão", () => {
    expect(generateTempPassword()).toHaveLength(12);
  });

  it("respeita o comprimento solicitado", () => {
    expect(generateTempPassword(20)).toHaveLength(20);
  });

  it("usa apenas o charset definido (sem caracteres ambíguos)", () => {
    const pw = generateTempPassword(500);
    for (const ch of pw) {
      expect(TEMP_PASSWORD_CHARS).toContain(ch);
    }
  });

  it("não inclui caracteres ambíguos (0, O, 1, l, I)", () => {
    expect(TEMP_PASSWORD_CHARS).not.toMatch(/[0O1lI]/);
  });

  it("gera valores distintos entre chamadas consecutivas", () => {
    const valores = new Set(
      Array.from({ length: 50 }, () => generateTempPassword()),
    );
    expect(valores.size).toBe(50);
  });
});
