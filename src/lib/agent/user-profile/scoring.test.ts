import { decayedScore, rankByScore, HALF_LIFE_DAYS, MIN_SCORE } from "./scoring";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("decayedScore", () => {
  it("sem idade, score = count", () => {
    const now = 1_000_000_000_000;
    expect(decayedScore(10, now, now)).toBeCloseTo(10, 5);
  });

  it("uma meia-vida reduz pela metade", () => {
    const now = 1_000_000_000_000;
    const lastSeen = now - HALF_LIFE_DAYS * DAY_MS;
    expect(decayedScore(10, lastSeen, now)).toBeCloseTo(5, 5);
  });

  it("item antigo de count baixo cai abaixo de MIN_SCORE", () => {
    const now = 1_000_000_000_000;
    const lastSeen = now - 6 * HALF_LIFE_DAYS * DAY_MS; // 180 dias
    expect(decayedScore(1, lastSeen, now)).toBeLessThan(MIN_SCORE);
  });
});

describe("rankByScore", () => {
  it("filtra < MIN_SCORE e ordena desc", () => {
    const items = [
      { id: "a", score: 0.1 },
      { id: "b", score: 5 },
      { id: "c", score: 2 },
    ];
    const out = rankByScore(items);
    expect(out.map((i) => i.id)).toEqual(["b", "c"]); // a some (0.1 < 0.15)
  });
});
