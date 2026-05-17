import { REPORT_CATALOG } from "./catalog";

describe("catálogo — R1", () => {
  it("R1 tem os campos obrigatórios e domínio estoque", () => {
    const r1 = REPORT_CATALOG.find((r) => r.id === "saldo-produto");
    expect(r1).toBeDefined();
    expect(r1?.dominio).toBe("estoque");
    expect(r1?.modeloFonte).toBe("estoque.saldo.hoje");
    expect(r1?.secoes).toHaveLength(1);
    expect(r1?.secoes[0].template).toBe("DataTable");
    expect(r1?.secoes[0].fato).toBe("fato_estoque_saldo");
  });
});
