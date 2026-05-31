import { mapEstoqueMinMaxRow } from "./fato-estoque-minimo-maximo";

describe("B6 , builder de mín/máx de estoque", () => {
  it("mapeia produto/local/unidade (m2o) e quantidades", () => {
    const r = mapEstoqueMinMaxRow({
      id: 4, produto_id: [10, "Produto A"], local_id: [2, "Armazém Central"],
      unidade_id: [1, "UN"], quantidade_minima: 5, quantidade_maxima: 50,
    });
    expect(r).toMatchObject({
      odooId: 4, produtoId: 10, produtoNome: "Produto A",
      localId: 2, localNome: "Armazém Central", unidadeNome: "UN",
      quantidadeMinima: 5, quantidadeMaxima: 50,
    });
  });

  it("defensivo: ausentes → null/0", () => {
    const r = mapEstoqueMinMaxRow({ id: 1 });
    expect(r).toMatchObject({ odooId: 1, produtoId: null, quantidadeMinima: 0, quantidadeMaxima: 0 });
  });
});
