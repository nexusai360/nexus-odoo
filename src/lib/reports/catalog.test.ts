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

describe("catálogo — R2", () => {
  it("R2 é um BarChart sobre fato_estoque_saldo, sem filtros", () => {
    const r2 = REPORT_CATALOG.find((r) => r.id === "valor-armazem");
    expect(r2?.dominio).toBe("estoque");
    expect(r2?.secoes[0].template).toBe("BarChart");
    expect(r2?.secoes[0].fato).toBe("fato_estoque_saldo");
    expect(r2?.secoes[0].filtros).toEqual([]);
  });
});

describe("catálogo — R3", () => {
  it("R3 é um LineChart sobre fato_estoque_movimento, com filtro de período", () => {
    const r3 = REPORT_CATALOG.find((r) => r.id === "entradas-saidas");
    expect(r3?.secoes[0].template).toBe("LineChart");
    expect(r3?.secoes[0].fato).toBe("fato_estoque_movimento");
    expect(r3?.modeloFonte).toBe("estoque.extrato");
    expect(r3?.secoes[0].filtros.map((f) => f.tipo)).toEqual(["periodo", "armazem"]);
  });
});

describe("catálogo — R4", () => {
  it("R4 tem 2 seções: KPICard + DataTable sobre fato_produto_parado", () => {
    const r4 = REPORT_CATALOG.find((r) => r.id === "produtos-parados");
    expect(r4?.secoes).toHaveLength(2);
    expect(r4?.secoes.map((s) => s.template)).toEqual(["KPICard", "DataTable"]);
    expect(r4?.secoes.every((s) => s.fato === "fato_produto_parado")).toBe(true);
  });
});

describe("catálogo — R5", () => {
  it("R5 é um BarChart sobre fato_estoque_movimento, filtros período+sentido", () => {
    const r5 = REPORT_CATALOG.find((r) => r.id === "top-movimentados");
    expect(r5?.secoes[0].template).toBe("BarChart");
    expect(r5?.secoes[0].fato).toBe("fato_estoque_movimento");
    expect(r5?.secoes[0].filtros.map((f) => f.tipo)).toEqual(["periodo", "sentido"]);
  });
});
