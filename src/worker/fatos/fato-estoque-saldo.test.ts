import { mapSaldoRow, buildProdutoClassMap } from "./fato-estoque-saldo";

describe("mapSaldoRow", () => {
  it("extrai os campos do registro raw do Odoo", () => {
    const raw = {
      id: 99,
      produto_id: [12, "Esteira X"],
      local_id: [3, "Galpão A"],
      saldo: 7,
      unidade_id: [1, "UN"],
    };
    expect(mapSaldoRow(raw)).toEqual({
      odooSaldoId: 99,
      produtoId: 12,
      produtoNome: "Esteira X",
      localId: 3,
      localNome: "Galpão A",
      quantidade: 7,
      unidade: "UN",
    });
  });

  it("tolera campos relacionais ausentes (false)", () => {
    const raw = { id: 1, produto_id: false, local_id: false, saldo: 0, unidade_id: false };
    const m = mapSaldoRow(raw);
    expect(m.produtoId).toBeNull();
    expect(m.produtoNome).toBeNull();
    expect(m.quantidade).toBe(0);
  });
});

describe("buildProdutoClassMap", () => {
  it("monta o mapa produtoId -> classificação", () => {
    const rows = [
      { data: { id: 10, familia_id: [2, "Esteiras"], marca_id: [5, "Matrix"] } },
      { data: { id: 11, familia_id: false, marca_id: false } },
    ];
    const map = buildProdutoClassMap(rows);
    expect(map.get(10)).toEqual({
      familiaId: 2, familiaNome: "Esteiras", marcaId: 5, marcaNome: "Matrix",
    });
    expect(map.get(11)).toEqual({
      familiaId: null, familiaNome: null, marcaId: null, marcaNome: null,
    });
  });
  it("retorna mapa vazio quando não há linhas", () => {
    expect(buildProdutoClassMap([]).size).toBe(0);
  });
});
