import { ordenarNarrativa } from "./ordenar-narrativa";
import type { BlueprintSecao } from "./blueprint-types";

const sec = (template: BlueprintSecao["template"]): BlueprintSecao => ({
  template,
  fato: "fato_estoque_saldo",
  shapeDerivado: "tabela",
  config: {},
});

describe("ordenarNarrativa", () => {
  it("panorama (KPIRow) primeiro, comparativos no meio, tabela por ultimo", () => {
    const out = ordenarNarrativa([sec("DataTable"), sec("BarChart"), sec("KPIRow"), sec("PieChart")]);
    expect(out.map((s) => s.template)).toEqual(["KPIRow", "BarChart", "PieChart", "DataTable"]);
  });

  it("estavel dentro do mesmo papel", () => {
    const a = { ...sec("BarChart"), config: { titulo: "A" } };
    const b = { ...sec("BarChart"), config: { titulo: "B" } };
    const out = ordenarNarrativa([a, b]);
    expect(out.map((s) => s.config.titulo)).toEqual(["A", "B"]);
  });
});
