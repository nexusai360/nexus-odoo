jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import { listarMetricas, dominiosRegistrados } from "./metric-catalog";

describe("listarMetricas , catalogo derivado do registry", () => {
  it("expande fato_estoque_saldo (shape kpis) em metricas escalares distintas com campoKpi", () => {
    const ms = listarMetricas({ dominiosPermitidos: ["estoque"] });
    const saldoKpis = ms.filter((m) => m.fato === "fato_estoque_saldo" && m.shape === "kpis");
    expect(saldoKpis.map((m) => m.campoKpi).slice().sort()).toEqual([
      "produtosNegativos",
      "totalProdutos",
      "valorTotal",
    ]);
    // ids curados distintos por medida
    expect(new Set(saldoKpis.map((m) => m.id)).size).toBe(3);
  });

  it("deriva temSerieTemporal do shape do registry (movimento sim, saldo nao)", () => {
    const ms = listarMetricas({ dominiosPermitidos: ["estoque"] });
    expect(ms.find((m) => m.fato === "fato_estoque_movimento")?.temSerieTemporal).toBe(true);
    expect(ms.find((m) => m.fato === "fato_estoque_saldo")?.temSerieTemporal).toBe(false);
  });

  it("dimensoes nao vem vazio para um fato com recorte categorico", () => {
    const ms = listarMetricas({ dominiosPermitidos: ["estoque"] });
    const cat = ms.find((m) => m.shape === "agregacaoCategorica");
    expect(cat).toBeDefined();
    expect((cat?.dimensoes.length ?? 0)).toBeGreaterThan(0);
  });

  it("filtra por dominios permitidos: vazio => nenhuma metrica", () => {
    expect(listarMetricas({ dominiosPermitidos: [] })).toEqual([]);
    expect(listarMetricas({ dominiosPermitidos: ["estoque"] }).length).toBeGreaterThan(0);
  });

  it("cobre o dominio FINANCEIRO (saldo, fluxo de caixa serie, DRE)", () => {
    const ms = listarMetricas({ dominiosPermitidos: ["financeiro"] });
    expect(ms.every((m) => m.dominio === "financeiro")).toBe(true);
    const ids = ms.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining([
      "financeiro.saldo_total",
      "financeiro.saldo_por_banco",
      "financeiro.fluxo_caixa",
      "financeiro.receita",
      "financeiro.resultado_por_conta",
    ]));
    // fluxo de caixa e a unica metrica financeira temporal
    expect(ms.find((m) => m.id === "financeiro.fluxo_caixa")?.temSerieTemporal).toBe(true);
    expect(ms.find((m) => m.id === "financeiro.saldo_total")?.temSerieTemporal).toBe(false);
  });

  it("estoque e financeiro nao se misturam, mas ambos sao registrados", () => {
    expect(dominiosRegistrados()).toEqual(expect.arrayContaining(["estoque", "financeiro"]));
    const todos = listarMetricas({ dominiosPermitidos: dominiosRegistrados() });
    expect(todos.some((m) => m.dominio === "estoque")).toBe(true);
    expect(todos.some((m) => m.dominio === "financeiro")).toBe(true);
  });

  it("chartsValidos reflete o shape (categorica aceita Bar/Pie/Funnel; kpis aceita KPIRow)", () => {
    const ms = listarMetricas({ dominiosPermitidos: ["estoque"] });
    const cat = ms.find((m) => m.shape === "agregacaoCategorica")!;
    expect(cat.chartsValidos).toEqual(expect.arrayContaining(["BarChart", "PieChart", "Funnel"]));
    const kpi = ms.find((m) => m.shape === "kpis")!;
    expect(kpi.chartsValidos).toEqual(["KPIRow"]);
  });

  it("comercial.por_etapa prefere o Funnel (pipeline por estagio)", () => {
    const ms = listarMetricas({ dominiosPermitidos: ["comercial"] });
    expect(ms.find((m) => m.id === "comercial.por_etapa")?.chartPreferido).toBe("Funnel");
  });

  it("fiscal.por_cliente prefere o Treemap (muitas categorias por area)", () => {
    const ms = listarMetricas({ dominiosPermitidos: ["fiscal"] });
    const cli = ms.find((m) => m.id === "fiscal.por_cliente");
    expect(cli?.chartPreferido).toBe("Treemap");
    expect(cli?.chartsValidos).toEqual(expect.arrayContaining(["BarChart", "Treemap"]));
  });

  it("financeiro.fluxo_caixa prefere o Combo (realizado barra + previsto linha)", () => {
    const ms = listarMetricas({ dominiosPermitidos: ["financeiro"] });
    const fluxo = ms.find((m) => m.id === "financeiro.fluxo_caixa");
    expect(fluxo?.chartPreferido).toBe("Combo");
    expect(fluxo?.chartsValidos).toEqual(expect.arrayContaining(["LineChart", "Combo"]));
  });

  it("financeiro.dre e uma metrica cascata que prefere o Waterfall", () => {
    const ms = listarMetricas({ dominiosPermitidos: ["financeiro"] });
    const dre = ms.find((m) => m.id === "financeiro.dre");
    expect(dre).toBeDefined();
    expect(dre!.shape).toBe("cascata");
    expect(dre!.chartPreferido).toBe("Waterfall");
    expect(dre!.chartsValidos).toEqual(["Waterfall"]);
  });
});
