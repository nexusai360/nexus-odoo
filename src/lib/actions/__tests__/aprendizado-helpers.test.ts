import {
  emptyMatrix,
  agreementPct,
  matrixTotals,
  disagreementSeverity,
  aggregatePatterns,
  BUCKETS,
} from "../aprendizado-helpers";

describe("emptyMatrix", () => {
  test("4x4 zerada", () => {
    const m = emptyMatrix();
    let total = 0;
    for (const u of BUCKETS) for (const j of BUCKETS) total += m[u][j];
    expect(total).toBe(0);
  });
});

describe("agreementPct + matrixTotals", () => {
  test("diagonal conta como concordância", () => {
    const m = emptyMatrix();
    m.CORRETO.CORRETO = 3; // concorda
    m.ERRADO.CORRETO = 1; // discorda
    expect(agreementPct(m)).toBe(75); // 3 de 4
    expect(matrixTotals(m)).toEqual({ crossed: 4, disagreements: 1 });
  });
  test("matriz vazia => null", () => {
    expect(agreementPct(emptyMatrix())).toBeNull();
  });
});

describe("disagreementSeverity", () => {
  test("juiz otimista (CORRETO) vs usuário ALUCINOU é o mais severo", () => {
    const sevOverconf = disagreementSeverity("ALUCINOU", "CORRETO"); // juiz superestima muito
    const sevUnderconf = disagreementSeverity("CORRETO", "ALUCINOU"); // juiz subestima
    const sevSmall = disagreementSeverity("CORRETO", "PARCIAL");
    expect(sevOverconf).toBeGreaterThan(sevSmall);
    expect(sevOverconf).toBeGreaterThan(sevUnderconf);
  });
  test("juiz subestimando fica negativo (vai pro fim da ordenação)", () => {
    expect(disagreementSeverity("CORRETO", "ERRADO")).toBeLessThan(0);
  });
});

describe("aggregatePatterns", () => {
  test("conta e ordena desc, ignora vazios", () => {
    const res = aggregatePatterns([
      ["a", "b"],
      ["a"],
      null,
      ["", "c"],
      undefined,
    ]);
    expect(res).toEqual([
      { pattern: "a", count: 2 },
      { pattern: "b", count: 1 },
      { pattern: "c", count: 1 },
    ]);
  });
});
