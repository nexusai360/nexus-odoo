import { mapSaldoRow } from "./fato-estoque-saldo";

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
