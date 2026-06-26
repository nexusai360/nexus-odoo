import {
  adaptarTabela,
  adaptarKpis,
  adaptarAgregacaoCategorica,
} from "./shape-adapters";
import type { RawSourceData } from "./types";

describe("shape-adapters", () => {
  it("adaptarTabela devolve as linhas como estao", () => {
    const raw: RawSourceData = {
      linhas: [
        { produtoNome: "Esteira", valorTotal: 1000 },
        { produtoNome: "Bike", valorTotal: 500 },
      ],
      freshness: null,
    };
    expect(adaptarTabela(raw)).toEqual([
      { produtoNome: "Esteira", valorTotal: 1000 },
      { produtoNome: "Bike", valorTotal: 500 },
    ]);
  });

  it("adaptarKpis devolve os escalares (vazio quando ausente)", () => {
    expect(
      adaptarKpis({ linhas: [], kpis: { valorTotal: 1500, totalProdutos: 2 }, freshness: null }),
    ).toEqual({ valorTotal: 1500, totalProdutos: 2 });
    expect(adaptarKpis({ linhas: [], freshness: null })).toEqual({});
  });

  it("adaptarAgregacaoCategorica ordena por valor desc e aplica topN", () => {
    const raw: RawSourceData = {
      linhas: [
        { rotulo: "Cardio", valor: 300 },
        { rotulo: "Musculacao", valor: 900 },
        { rotulo: "Acessorios", valor: 100 },
      ],
      freshness: null,
    };
    expect(adaptarAgregacaoCategorica(raw, { topN: 2 })).toEqual([
      { rotulo: "Musculacao", valor: 900 },
      { rotulo: "Cardio", valor: 300 },
    ]);
  });
});
