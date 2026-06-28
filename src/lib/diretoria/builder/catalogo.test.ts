import {
  CATALOGO,
  componentePorId,
  travasDoTipo,
  areaDoDominio,
  ALTURAS,
  LARGURAS,
  type TipoComponente,
} from "./catalogo";

describe("catálogo de componentes", () => {
  it("ids são únicos", () => {
    const ids = CATALOGO.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("todo componente tem capability namespaced da sua área", () => {
    for (const c of CATALOGO) {
      expect(c.capability).toBe(`diretoria.${areaDoDominio(c.dominio)}.view`);
      expect(c.capability.length).toBeGreaterThan(0);
    }
  });

  it("travas do tipo são coerentes (min <= max, dentro dos conjuntos)", () => {
    const tipos: TipoComponente[] = ["kpi", "tabela", "grafico", "mapa", "widget"];
    for (const t of tipos) {
      const tr = travasDoTipo(t);
      expect(tr.larguraMin).toBeLessThanOrEqual(tr.larguraMax);
      expect(tr.alturaMin).toBeLessThanOrEqual(tr.alturaMax);
      expect(LARGURAS).toContain(tr.larguraMin);
      expect(LARGURAS).toContain(tr.larguraMax);
      expect(ALTURAS).toContain(tr.alturaMin);
      expect(ALTURAS).toContain(tr.alturaMax);
    }
  });

  it("componentePorId encontra e retorna null para inexistente", () => {
    expect(componentePorId("A-01")?.nome).toBe("Indicadores de estoque");
    expect(componentePorId("ZZ-99")).toBeNull();
  });

  it("KPI tem trava de largura 1-2 e altura 1-2", () => {
    const tr = travasDoTipo("kpi");
    expect(tr).toEqual({ larguraMin: 1, larguraMax: 2, alturaMin: 1, alturaMax: 2 });
  });
});
