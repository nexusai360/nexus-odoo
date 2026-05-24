import {
  ehMesValido,
  mesCorrente,
  resolverPeriodo,
  periodoParaParams,
  rotuloPeriodo,
} from "./periodo";

const HOJE = new Date(Date.UTC(2026, 4, 17)); // 2026-05

describe("ehMesValido", () => {
  it("aceita YYYY-MM", () => expect(ehMesValido("2026-05")).toBe(true));
  it("rejeita formatos errados", () => {
    for (const s of ["2026-5", "2026/05", "abc", "2026-13", "", "2026-00"]) {
      expect(ehMesValido(s)).toBe(false);
    }
  });
});

describe("mesCorrente", () => {
  it("retorna o mês de hoje em UTC", () => {
    expect(mesCorrente(HOJE)).toBe("2026-05");
  });
});

describe("resolverPeriodo", () => {
  it("preset mes", () => {
    expect(resolverPeriodo({ periodo: "mes" }, "3meses", HOJE)).toEqual({
      preset: "mes",
      de: "2026-05",
      ate: "2026-05",
    });
  });
  it("preset 3meses = 3 meses inclusivos", () => {
    expect(resolverPeriodo({ periodo: "3meses" }, "3meses", HOJE)).toEqual({
      preset: "3meses",
      de: "2026-03",
      ate: "2026-05",
    });
  });
  it("preset ano", () => {
    expect(resolverPeriodo({ periodo: "ano" }, "3meses", HOJE)).toEqual({
      preset: "ano",
      de: "2026-01",
      ate: "2026-05",
    });
  });
  it("preset tudo zera de/ate", () => {
    expect(resolverPeriodo({ periodo: "tudo" }, "3meses", HOJE)).toEqual({
      preset: "tudo",
      de: null,
      ate: null,
    });
  });
  it("sem periodo usa o padrao", () => {
    expect(resolverPeriodo({}, "ano", HOJE).preset).toBe("ano");
  });
  it("periodo desconhecido cai no padrao", () => {
    expect(resolverPeriodo({ periodo: "xpto" }, "mes", HOJE).preset).toBe("mes");
  });
  it("custom valido", () => {
    expect(
      resolverPeriodo(
        { periodo: "custom", de: "2026-01", ate: "2026-03" },
        "mes",
        HOJE,
      ),
    ).toEqual({ preset: "custom", de: "2026-01", ate: "2026-03" });
  });
  it("custom com de > ate troca as pontas", () => {
    expect(
      resolverPeriodo(
        { periodo: "custom", de: "2026-03", ate: "2026-01" },
        "mes",
        HOJE,
      ),
    ).toEqual({ preset: "custom", de: "2026-01", ate: "2026-03" });
  });
  it("custom com so uma ponta valida cai no padrao", () => {
    expect(
      resolverPeriodo({ periodo: "custom", de: "2026-01" }, "mes", HOJE).preset,
    ).toBe("mes");
    expect(
      resolverPeriodo(
        { periodo: "custom", de: "x", ate: "2026-03" },
        "mes",
        HOJE,
      ).preset,
    ).toBe("mes");
  });
  it("custom recorta mes futuro ao mes corrente", () => {
    expect(
      resolverPeriodo(
        { periodo: "custom", de: "2026-01", ate: "2026-12" },
        "mes",
        HOJE,
      ),
    ).toEqual({ preset: "custom", de: "2026-01", ate: "2026-05" });
  });
});

describe("periodoParaParams", () => {
  it("emite periodo sem de/ate em preset nao-custom", () => {
    expect(
      periodoParaParams({ preset: "3meses", de: "2026-03", ate: "2026-05" }),
    ).toEqual({ periodo: "3meses" });
  });
  it("emite de/ate em custom", () => {
    expect(
      periodoParaParams({ preset: "custom", de: "2026-01", ate: "2026-03" }),
    ).toEqual({ periodo: "custom", de: "2026-01", ate: "2026-03" });
  });
  it("ida e volta com resolverPeriodo", () => {
    const p = resolverPeriodo(
      { periodo: "custom", de: "2026-01", ate: "2026-03" },
      "mes",
      HOJE,
    );
    expect(resolverPeriodo(periodoParaParams(p), "mes", HOJE)).toEqual(p);
  });
});

describe("rotuloPeriodo", () => {
  it("tudo", () =>
    expect(rotuloPeriodo({ preset: "tudo", de: null, ate: null })).toBe(
      "Tudo",
    ));
  it("mes unico", () =>
    expect(
      rotuloPeriodo({ preset: "mes", de: "2026-03", ate: "2026-03" }),
    ).toBe("mar/2026"));
  it("intervalo", () =>
    expect(
      rotuloPeriodo({ preset: "custom", de: "2026-01", ate: "2026-03" }),
    ).toBe("jan/2026 , mar/2026"));
});
