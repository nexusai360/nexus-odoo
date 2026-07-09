jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import { revisarPlano } from "./revisor";
import type { Plano, Bloco } from "./plano-types";
import type { AmostraMetrica } from "./amostra";

function plano(blocos: Bloco[]): Plano {
  return { titulo: "x", objetivo: "y", dominio: "estoque", blocos, filtrosIniciais: {} };
}

describe("revisarPlano , invariantes estruturais", () => {
  it("teto por papel: 4 Rankings de recortes diferentes viram 1 (mata as 4 barras)", () => {
    const blocos = ["armazem", "marca", "familia", "negativos"].map(
      (r): Bloco => ({ tipo: "Ranking", metrica: "estoque.valor", recorte: r }),
    );
    const { plano: out, ajustes } = revisarPlano(plano(blocos), { metricas: [], amostra: [] });
    expect(out.blocos.filter((b) => b.tipo === "Ranking")).toHaveLength(1);
    expect(ajustes.some((a) => a.regra === "teto_por_papel")).toBe(true);
  });

  it("no maximo 1 KpiStrip", () => {
    const blocos: Bloco[] = [
      { tipo: "KpiStrip", metricas: ["a"] },
      { tipo: "KpiStrip", metricas: ["b"] },
    ];
    const { plano: out, ajustes } = revisarPlano(plano(blocos), { metricas: [], amostra: [] });
    expect(out.blocos.filter((b) => b.tipo === "KpiStrip")).toHaveLength(1);
    expect(ajustes.some((a) => a.regra === "kpi_unico")).toBe(true);
  });

  it("donut com >6 categorias rebaixa TendenciaDistribuicao para Ranking", () => {
    const blocos: Bloco[] = [
      { tipo: "TendenciaDistribuicao", metricaSerie: "estoque.movimento", metricaComposicao: "estoque.valor_marca" },
    ];
    const amostra: AmostraMetrica[] = [
      { metricaId: "estoque.movimento", nPontosSerie: 6 },
      { metricaId: "estoque.valor_marca", cardinalidade: 8 },
    ];
    const { plano: out, ajustes } = revisarPlano(plano(blocos), { metricas: [], amostra });
    expect(out.blocos[0].tipo).toBe("Ranking");
    expect(ajustes.some((a) => a.regra === "donut_acima_de_6")).toBe(true);
  });

  it("serie com <4 pontos degrada o bloco temporal", () => {
    const blocos: Bloco[] = [
      { tipo: "TendenciaDistribuicao", metricaSerie: "estoque.movimento", metricaComposicao: "estoque.valor_marca" },
    ];
    const amostra: AmostraMetrica[] = [
      { metricaId: "estoque.movimento", nPontosSerie: 2 },
      { metricaId: "estoque.valor_marca", cardinalidade: 4 },
    ];
    const { plano: out, ajustes } = revisarPlano(plano(blocos), { metricas: [], amostra });
    expect(out.blocos[0].tipo).toBe("Ranking");
    expect(ajustes.some((a) => a.regra === "serie_curta_degrada")).toBe(true);
  });

  it("dedup de KPI por valor resolvido colidente (mesmo numero em 3 metricas vira 1)", () => {
    const blocos: Bloco[] = [
      { tipo: "KpiStrip", metricas: ["estoque.valor_total", "estoque.valor_armazem", "estoque.valor_marca"] },
    ];
    const amostra: AmostraMetrica[] = [
      { metricaId: "estoque.valor_total", escalar: 49447434.34 },
      { metricaId: "estoque.valor_armazem", escalar: 49447434.34 },
      { metricaId: "estoque.valor_marca", escalar: 49447434.34 },
    ];
    const { plano: out, ajustes } = revisarPlano(plano(blocos), { metricas: [], amostra });
    const kpi = out.blocos.find((b) => b.tipo === "KpiStrip");
    expect(kpi?.tipo === "KpiStrip" && kpi.metricas).toHaveLength(1);
    expect(ajustes.some((a) => a.regra === "kpi_valor_colidente")).toBe(true);
  });

  it("KPIs com valores distintos sao TODOS preservados (nao colapsa panorama legitimo)", () => {
    const blocos: Bloco[] = [
      { tipo: "KpiStrip", metricas: ["estoque.valor_total", "estoque.produtos", "estoque.negativos"] },
    ];
    const amostra: AmostraMetrica[] = [
      { metricaId: "estoque.valor_total", escalar: 49447434.34 },
      { metricaId: "estoque.produtos", escalar: 1894 },
      { metricaId: "estoque.negativos", escalar: 172 },
    ];
    const { plano: out } = revisarPlano(plano(blocos), { metricas: [], amostra });
    const kpi = out.blocos.find((b) => b.tipo === "KpiStrip");
    expect(kpi?.tipo === "KpiStrip" && kpi.metricas).toHaveLength(3);
  });

  it("ordena no arco panorama -> analise -> detalhe", () => {
    const blocos: Bloco[] = [
      { tipo: "Tabela", metrica: "t" },
      { tipo: "Ranking", metrica: "r", recorte: "armazem" },
      { tipo: "KpiStrip", metricas: ["k"] },
    ];
    const { plano: out } = revisarPlano(plano(blocos), { metricas: [], amostra: [] });
    expect(out.blocos.map((b) => b.tipo)).toEqual(["KpiStrip", "Ranking", "Tabela"]);
  });
});
