import {
  ehMesValido,
  mesCorrente,
  resolverPeriodo,
  periodoParaParams,
  rotuloPeriodo,
} from "./periodo";

const HOJE = new Date(Date.UTC(2026, 4, 17)); // 2026-05
// Data de início das análises usada nos testes. Os casos abaixo passam um corte ANTIGO
// (2026-01) quando querem exercitar a resolução do período sem interferência do piso, e um
// corte realista (2026-03-16) nos casos que testam o piso em si.
const CORTE_ANTIGO = "2026-01-01";
const CORTE = "2026-03-16";

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
    expect(resolverPeriodo({ periodo: "ano" }, "3meses", HOJE, CORTE_ANTIGO)).toEqual({
      preset: "ano",
      de: "2026-01",
      ate: "2026-05",
    });
  });
  it("preset tudo = do inicio das analises ate hoje, com teto ABERTO", () => {
    // "Tudo" nunca foi o cache inteiro: e tudo o que a plataforma analisa. O teto fica
    // aberto de proposito, para documento com data futura (vencimento, previsao) entrar.
    expect(resolverPeriodo({ periodo: "tudo" }, "3meses", HOJE, CORTE)).toEqual({
      preset: "tudo",
      de: "2026-03",
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
        CORTE_ANTIGO,
      ),
    ).toEqual({ preset: "custom", de: "2026-01", ate: "2026-03" });
  });
  it("custom com de > ate troca as pontas", () => {
    expect(
      resolverPeriodo(
        { periodo: "custom", de: "2026-03", ate: "2026-01" },
        "mes",
        HOJE,
        CORTE_ANTIGO,
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
        CORTE_ANTIGO,
      ),
    ).toEqual({ preset: "custom", de: "2026-01", ate: "2026-05" });
  });

  // O piso da data de inicio das analises: a janela MOSTRADA tem que ser a janela LIDA.
  // Antes, o preset "Ano" nascia em janeiro e o calendario aceitava mes pre-corte; a query
  // grampeava por baixo (o dado saia certo) e a barra continuava anunciando "jan..mai".
  it("preset ano nao nasce antes do inicio das analises", () => {
    expect(resolverPeriodo({ periodo: "ano" }, "mes", HOJE, CORTE)).toEqual({
      preset: "ano",
      de: "2026-03",
      ate: "2026-05",
    });
  });
  it("custom anterior ao inicio das analises e puxado para ele", () => {
    expect(
      resolverPeriodo({ periodo: "custom", de: "2025-01", ate: "2026-04" }, "mes", HOJE, CORTE),
    ).toEqual({ preset: "custom", de: "2026-03", ate: "2026-04" });
  });
  it("custom inteiramente anterior colapsa no mes do corte", () => {
    expect(
      resolverPeriodo({ periodo: "custom", de: "2025-01", ate: "2025-06" }, "mes", HOJE, CORTE),
    ).toEqual({ preset: "custom", de: "2026-03", ate: "2026-03" });
  });
  it("3meses nao desce abaixo do corte", () => {
    // Hoje = maio; 3 meses seria marco..maio, e o corte e marco: nao muda nada.
    expect(resolverPeriodo({ periodo: "3meses" }, "mes", HOJE, "2026-04-10")).toEqual({
      preset: "3meses",
      de: "2026-04",
      ate: "2026-05",
    });
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
