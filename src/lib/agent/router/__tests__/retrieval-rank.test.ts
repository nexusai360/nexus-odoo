import { rankOf } from "../retrieval-rank";

describe("rankOf", () => {
  const offered = ["fiscal_faturamento_periodo", "fiscal_notas_emitidas", "comercial_pedidos_periodo"];

  it("retorna o indice 0-based da tool no ranking oferecido", () => {
    expect(rankOf("fiscal_faturamento_periodo", offered)).toBe(0);
    expect(rankOf("comercial_pedidos_periodo", offered)).toBe(2);
  });

  it("retorna null quando a tool nao esta no ranking", () => {
    expect(rankOf("estoque_saldo", offered)).toBeNull();
  });

  it("retorna null para ranking vazio", () => {
    expect(rankOf("qualquer", [])).toBeNull();
  });
});
