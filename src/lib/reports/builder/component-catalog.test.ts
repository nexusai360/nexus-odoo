import {
  listarComponentes,
  descreverComponente,
} from "./component-catalog";

describe("component-catalog", () => {
  it("listarComponentes inclui DataTable na onda 1", () => {
    const chaves = listarComponentes().map((c) => c.chave);
    expect(chaves).toContain("DataTable");
  });

  it("descreverComponente(DataTable) exige o shape tabela e tem parametros", () => {
    const c = descreverComponente("DataTable");
    expect(c).toBeDefined();
    expect(c!.shapeDerivadoExigido).toBe("tabela");
    expect(Array.isArray(c!.parametros)).toBe(true);
  });

  it("descreverComponente de chave inexistente e undefined", () => {
    expect(descreverComponente("Hologram")).toBeUndefined();
  });

  it("descreverComponente(Funnel) exige agregacaoCategorica (mesmo shape da barra)", () => {
    const c = descreverComponente("Funnel");
    expect(c).toBeDefined();
    expect(c!.shapeDerivadoExigido).toBe("agregacaoCategorica");
  });
});
