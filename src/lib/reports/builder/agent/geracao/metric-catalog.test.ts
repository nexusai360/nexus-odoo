jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import { listarMetricas } from "./metric-catalog";

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

  it("chartsValidos reflete o shape (categorica aceita Bar/Pie; kpis aceita KPIRow)", () => {
    const ms = listarMetricas({ dominiosPermitidos: ["estoque"] });
    const cat = ms.find((m) => m.shape === "agregacaoCategorica")!;
    expect(cat.chartsValidos).toEqual(expect.arrayContaining(["BarChart", "PieChart"]));
    const kpi = ms.find((m) => m.shape === "kpis")!;
    expect(kpi.chartsValidos).toEqual(["KPIRow"]);
  });
});
