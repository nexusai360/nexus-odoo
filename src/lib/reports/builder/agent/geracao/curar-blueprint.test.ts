import { curarBlueprint } from "./curar-blueprint";
import type { Blueprint, BlueprintSecao } from "./blueprint-types";

const sec = (over: Partial<BlueprintSecao>): BlueprintSecao => ({
  template: "BarChart",
  fato: "fato_estoque_saldo",
  shapeDerivado: "agregacaoCategorica",
  config: {},
  ...over,
});

const bp = (secoes: BlueprintSecao[]): Blueprint => ({ titulo: "t", objetivo: "o", secoes });

describe("curarBlueprint", () => {
  it("mantem NO MAXIMO uma KPIRow (mata a duplicacao de KPIs)", () => {
    const out = curarBlueprint(
      bp([
        sec({ template: "KPIRow", shapeDerivado: "kpis" }),
        sec({ template: "KPIRow", shapeDerivado: "kpis", fato: "fato_estoque_parados" }),
        sec({ template: "DataTable", shapeDerivado: "tabela" }),
      ]),
    );
    expect(out.secoes.filter((s) => s.template === "KPIRow")).toHaveLength(1);
  });

  it("descarta secoes equivalentes (mesmo template+fato+shape+recorte)", () => {
    const out = curarBlueprint(
      bp([
        sec({ config: { recorte: "por armazem" } }),
        sec({ config: { recorte: "por armazem" } }),
        sec({ config: { recorte: "por marca" } }),
      ]),
    );
    expect(out.secoes).toHaveLength(2);
  });

  it("respeita o teto de secoes", () => {
    const muitas = Array.from({ length: 12 }, (_, i) =>
      sec({ fato: `fato_estoque_${i}`, config: { recorte: String(i) } }),
    );
    expect(curarBlueprint(bp(muitas), { maxSecoes: 6 }).secoes.length).toBeLessThanOrEqual(6);
  });

  it("ordena na narrativa (KPIRow primeiro, tabela por ultimo)", () => {
    const out = curarBlueprint(
      bp([
        sec({ template: "DataTable", shapeDerivado: "tabela" }),
        sec({ template: "KPIRow", shapeDerivado: "kpis" }),
        sec({ template: "BarChart" }),
      ]),
    );
    expect(out.secoes[0].template).toBe("KPIRow");
    expect(out.secoes[out.secoes.length - 1].template).toBe("DataTable");
  });
});
