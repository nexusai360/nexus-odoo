import { buildPeriodoWhere } from "./periodo";

describe("buildPeriodoWhere", () => {
  it("ambos ausentes retorna objeto vazio", () => {
    expect(buildPeriodoWhere()).toEqual({});
  });

  it("par completo gera borda exclusiva (+1 dia UTC sobre ate)", () => {
    expect(buildPeriodoWhere("2026-01-01", "2026-01-31")).toEqual({
      dataEmissao: {
        gte: new Date("2026-01-01T00:00:00Z"),
        lt: new Date("2026-02-01T00:00:00Z"),
      },
    });
  });

  it("ate no fim de fevereiro vira lt = 1 de marco", () => {
    expect(buildPeriodoWhere("2026-02-01", "2026-02-28")).toEqual({
      dataEmissao: {
        gte: new Date("2026-02-01T00:00:00Z"),
        lt: new Date("2026-03-01T00:00:00Z"),
      },
    });
  });

  it("so de presente retorna objeto vazio (exige o par)", () => {
    expect(buildPeriodoWhere("2026-01-01", undefined)).toEqual({});
  });

  it("so ate presente retorna objeto vazio (exige o par)", () => {
    expect(buildPeriodoWhere(undefined, "2026-01-31")).toEqual({});
  });
});
