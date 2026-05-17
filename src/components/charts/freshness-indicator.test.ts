import { tempoRelativo } from "./freshness-indicator";

const AGORA = new Date("2026-05-17T20:00:00Z");

describe("tempoRelativo", () => {
  it("menos de 1 min → 'agora mesmo'", () => {
    expect(tempoRelativo(new Date("2026-05-17T19:59:30Z"), AGORA)).toBe(
      "agora mesmo",
    );
  });
  it("minutos", () => {
    expect(tempoRelativo(new Date("2026-05-17T19:52:00Z"), AGORA)).toBe(
      "há 8 min",
    );
  });
  it("horas", () => {
    expect(tempoRelativo(new Date("2026-05-17T17:00:00Z"), AGORA)).toBe(
      "há 3 h",
    );
  });
  it("dias (singular e plural)", () => {
    expect(tempoRelativo(new Date("2026-05-16T20:00:00Z"), AGORA)).toBe(
      "há 1 dia",
    );
    expect(tempoRelativo(new Date("2026-05-14T20:00:00Z"), AGORA)).toBe(
      "há 3 dias",
    );
  });
  it("data no futuro → 'agora mesmo'", () => {
    expect(tempoRelativo(new Date("2026-05-17T20:05:00Z"), AGORA)).toBe(
      "agora mesmo",
    );
  });
});
