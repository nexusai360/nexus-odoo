import { buildPeriodoWhere } from "./periodo";

describe("buildPeriodoWhere", () => {
  // Sem periodo explicito o piso do corte continua valendo: nenhuma metrica varre
  // documento anterior ao marco zero (16/03/2026 por padrao).
  it("ambos ausentes: piso no corte de dados", () => {
    const w = buildPeriodoWhere();
    expect(w.dataEmissao?.gte).toEqual(new Date("2026-03-16T00:00:00Z"));
  });

  it("par completo gera borda exclusiva (+1 dia UTC sobre ate)", () => {
    expect(buildPeriodoWhere("2026-04-01", "2026-04-30")).toEqual({
      dataEmissao: {
        gte: new Date("2026-04-01T00:00:00Z"),
        lt: new Date("2026-05-01T00:00:00Z"),
      },
    });
  });

  it("ate no fim de abril vira lt = 1 de maio (borda exclusiva)", () => {
    expect(buildPeriodoWhere("2026-04-01", "2026-04-30")).toEqual({
      dataEmissao: {
        gte: new Date("2026-04-01T00:00:00Z"),
        lt: new Date("2026-05-01T00:00:00Z"),
      },
    });
  });

  // Par incompleto nao vira intervalo, mas o piso do corte continua valendo.
  it("so de presente: piso no corte", () => {
    expect(buildPeriodoWhere("2026-04-01", undefined).dataEmissao?.gte).toEqual(
      new Date("2026-03-16T00:00:00Z"),
    );
  });

  it("so ate presente: piso no corte", () => {
    expect(buildPeriodoWhere(undefined, "2026-04-30").dataEmissao?.gte).toEqual(
      new Date("2026-03-16T00:00:00Z"),
    );
  });
});
