// src/worker/fatos/fato-preco.test.ts
import { mapPrecoRegraRow } from "./fato-preco";

describe("mapPrecoRegraRow", () => {
  it("resolve dimensão produto quando há produto_id", () => {
    const row = mapPrecoRegraRow({
      id: 1,
      tabela_id: [7, "Tabela Padrão"],
      produto_id: [82044, "ESTEIRA RT250"],
      familia_id: false,
      participante_id: false,
      operacao_produto: "fixo",
      preco_base_produto: "preco_venda",
      vr_fixo_produto: 20000,
      vr_regra_produto: 0,
      al_regra_produto: 0,
      quantidade_minima: 1,
      data_inicial: "2026-01-01",
      data_final: false,
    });
    expect(row.dimensao).toBe("produto");
    expect(row.produtoId).toBe(82044);
    expect(row.produtoNome).toBe("ESTEIRA RT250");
    expect(row.tabelaId).toBe(7);
    expect(row.tabelaNome).toBe("Tabela Padrão");
  });

  it("resolve valor de operação 'fixo' a partir de vr_fixo_produto", () => {
    const row = mapPrecoRegraRow({
      id: 2,
      operacao_produto: "fixo",
      vr_fixo_produto: 1500.5,
      vr_regra_produto: 99,
    });
    expect(row.valor).toBe(1500.5);
  });

  it("resolve valor de operação 'valor' a partir de vr_regra_produto", () => {
    const row = mapPrecoRegraRow({
      id: 3,
      operacao_produto: "valor",
      vr_fixo_produto: 99,
      vr_regra_produto: 320,
    });
    expect(row.valor).toBe(320);
  });

  it("deixa valor nulo em operações relativas e guarda o percentual em aliquota", () => {
    const row = mapPrecoRegraRow({
      id: 4,
      operacao_produto: "margem",
      al_regra_produto: 35,
      vr_regra_produto: 0,
    });
    expect(row.valor).toBeNull();
    expect(row.aliquota).toBe(35);
  });

  it("usa dimensão família e depois participante e por fim geral", () => {
    expect(
      mapPrecoRegraRow({ id: 5, familia_id: [9, "Cardio"] }).dimensao,
    ).toBe("familia");
    expect(
      mapPrecoRegraRow({ id: 6, participante_id: [3, "Cliente X"] }).dimensao,
    ).toBe("participante");
    expect(mapPrecoRegraRow({ id: 7 }).dimensao).toBe("geral");
  });

  it("converte datas e trata false como nulo", () => {
    const row = mapPrecoRegraRow({ id: 8, data_inicial: "2026-03-09", data_final: false });
    expect(row.dataInicial?.toISOString().slice(0, 10)).toBe("2026-03-09");
    expect(row.dataFinal).toBeNull();
  });

  it("quantidadeMinima cai para 0 quando ausente", () => {
    expect(mapPrecoRegraRow({ id: 9 }).quantidadeMinima).toBe(0);
  });
});
