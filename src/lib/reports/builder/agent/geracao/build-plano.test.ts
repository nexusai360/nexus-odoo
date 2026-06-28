jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import { buildFichaDoPlano } from "./build-plano";
import { listarMetricas } from "./metric-catalog";
import type { Plano } from "./plano-types";

const metricas = listarMetricas({ dominiosPermitidos: ["estoque"] });

const plano: Plano = {
  titulo: "Panorama do estoque",
  objetivo: "saude e composicao",
  dominio: "estoque",
  blocos: [
    { tipo: "KpiStrip", metricas: ["estoque.valor_total", "estoque.produtos", "estoque.negativos"] },
    { tipo: "Ranking", metrica: "estoque.valor_armazem", recorte: "armazem" },
    { tipo: "TendenciaDistribuicao", metricaSerie: "estoque.movimento", metricaComposicao: "estoque.valor_marca" },
    { tipo: "Tabela", metrica: "estoque.saldo_produto" },
  ],
  filtrosIniciais: {},
};

describe("buildFichaDoPlano", () => {
  it("constroi a ficha sem omitidos e com os templates certos", () => {
    const { ficha, omitidos } = buildFichaDoPlano(plano, metricas);
    expect(omitidos).toEqual([]);
    const tpls = ficha.secoes.map((s) => s.template);
    // KPIRow + BarChart(ranking) + LineChart + PieChart(grupo) + DataTable
    expect(tpls).toEqual(["KPIRow", "BarChart", "LineChart", "PieChart", "DataTable"]);
  });

  it("expande TendenciaDistribuicao em 2 secoes irmas com o mesmo grupoId", () => {
    const { ficha } = buildFichaDoPlano(plano, metricas);
    const line = ficha.secoes.find((s) => s.template === "LineChart");
    const pie = ficha.secoes.find((s) => s.template === "PieChart");
    expect(line?.config.grupoId).toBeDefined();
    expect(line?.config.grupoId).toBe(pie?.config.grupoId);
  });

  it("KPIRow carrega subtitulos por campoKpi e titulos derivam da metrica", () => {
    const { ficha } = buildFichaDoPlano(plano, metricas);
    const kpi = ficha.secoes.find((s) => s.template === "KPIRow");
    expect((kpi?.config.subtitulos as Record<string, string>)?.valorTotal).toBeTruthy();
    const ranking = ficha.secoes.find((s) => s.template === "BarChart");
    expect(ranking?.config.titulo).toBe("Valor por armazem");
  });

  it("o dispatcher ACEITA todas as secoes (compat ok)", () => {
    const { ficha } = buildFichaDoPlano(plano, metricas);
    expect(ficha.secoes).toHaveLength(5);
  });
});
