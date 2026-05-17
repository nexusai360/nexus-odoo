import { REPORT_CATALOG, reportsForUser, getReport } from "./catalog";

describe("catálogo — R1", () => {
  it("R1 tem os campos obrigatórios e domínio estoque", () => {
    const r1 = REPORT_CATALOG.find((r) => r.id === "saldo-produto");
    expect(r1).toBeDefined();
    expect(r1?.dominio).toBe("estoque");
    expect(r1?.modeloFonte).toBe("estoque.saldo.hoje");
    expect(r1?.secoes).toHaveLength(2);
    expect(r1?.secoes.map((s) => s.template)).toEqual(["KPIRow", "DataTable"]);
    expect(r1?.secoes.every((s) => s.fato === "fato_estoque_saldo")).toBe(true);
  });
  it("R1 tabela tem colunas agregadas (saldoTotal, valorTotal, numLocais)", () => {
    const r1 = REPORT_CATALOG.find((r) => r.id === "saldo-produto");
    const tabela = r1?.secoes.find((s) => s.template === "DataTable");
    const colunas = tabela?.config.colunas as Array<{ key: string }>;
    const chaves = colunas.map((c) => c.key);
    expect(chaves).toContain("produtoNome");
    expect(chaves).toContain("saldoTotal");
    expect(chaves).toContain("valorTotal");
    expect(chaves).toContain("numLocais");
    expect(chaves).not.toContain("localNome");
    expect(chaves).not.toContain("quantidade");
  });
  it("R1 filtros não incluem produto nem busca", () => {
    const r1 = REPORT_CATALOG.find((r) => r.id === "saldo-produto");
    const tipos = r1?.secoes.flatMap((s) => s.filtros.map((f) => f.tipo));
    expect(tipos).not.toContain("produto");
    expect(tipos).not.toContain("busca");
  });
});

describe("catálogo — R2", () => {
  it("R2 tem KPIRow + DataTable + BarChart sobre fato_estoque_saldo", () => {
    const r2 = REPORT_CATALOG.find((r) => r.id === "valor-armazem");
    expect(r2?.dominio).toBe("estoque");
    expect(r2?.secoes.map((s) => s.template)).toEqual([
      "KPIRow",
      "DataTable",
      "BarChart",
    ]);
    expect(r2?.secoes.every((s) => s.fato === "fato_estoque_saldo")).toBe(true);
  });
});

describe("catálogo — R3", () => {
  it("R3 tem LineChart + DataTable sobre fato_estoque_movimento, temporal + filtro armazém", () => {
    const r3 = REPORT_CATALOG.find((r) => r.id === "entradas-saidas");
    expect(r3?.secoes).toHaveLength(2);
    expect(r3?.secoes.map((s) => s.template)).toEqual(["LineChart", "DataTable"]);
    expect(r3?.secoes.every((s) => s.fato === "fato_estoque_movimento")).toBe(true);
    expect(r3?.modeloFonte).toBe("estoque.extrato");
    expect(r3?.temporal?.periodoPadrao).toBe("3meses");
    expect(r3?.secoes[0].filtros.map((f) => f.tipo)).toEqual(["armazem"]);
  });
  it("R3 DataTable (detalhe) tem colunas mes, sentido, produto, quantidade", () => {
    const r3 = REPORT_CATALOG.find((r) => r.id === "entradas-saidas");
    const tabela = r3?.secoes.find((s) => s.id === "detalhe");
    expect(tabela?.template).toBe("DataTable");
    const colunas = tabela?.config.colunas as Array<{ key: string }>;
    expect(colunas.map((c) => c.key)).toEqual(["mes", "sentido", "produto", "quantidade"]);
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
  it("R5 é um BarChart sobre fato_estoque_movimento, temporal + filtro sentido", () => {
    const r5 = REPORT_CATALOG.find((r) => r.id === "top-movimentados");
    expect(r5?.secoes[0].template).toBe("BarChart");
    expect(r5?.secoes[0].fato).toBe("fato_estoque_movimento");
    expect(r5?.temporal?.periodoPadrao).toBe("3meses");
    expect(r5?.secoes[0].filtros.map((f) => f.tipo)).toEqual(["sentido"]);
  });
});

describe("catálogo — R6", () => {
  it("R6 tem 2 seções: PieChart (família) + BarChart (marca)", () => {
    const r6 = REPORT_CATALOG.find((r) => r.id === "concentracao");
    expect(r6?.secoes).toHaveLength(2);
    expect(r6?.secoes.map((s) => s.template)).toEqual(["PieChart", "BarChart"]);
    expect(r6?.secoes.every((s) => s.fato === "fato_estoque_saldo")).toBe(true);
  });
  it("o catálogo tem exatamente 6 relatórios", () => {
    expect(REPORT_CATALOG).toHaveLength(6);
  });
});

describe("reportsForUser", () => {
  it("admin vê os 6 relatórios", () => {
    expect(reportsForUser("admin", [])).toHaveLength(6);
  });
  it("manager com domínio estoque vê os 6", () => {
    expect(reportsForUser("manager", ["estoque"])).toHaveLength(6);
  });
  it("manager sem domínio não vê nenhum", () => {
    expect(reportsForUser("manager", [])).toHaveLength(0);
  });
});

describe("getReport", () => {
  it("acha um relatório pelo id", () => {
    expect(getReport("saldo-produto")?.id).toBe("saldo-produto");
  });
  it("devolve undefined para id inexistente", () => {
    expect(getReport("nao-existe")).toBeUndefined();
  });
});
