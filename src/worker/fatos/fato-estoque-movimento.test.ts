import { mapMovimentoRow } from "./fato-estoque-movimento";

describe("mapMovimentoRow", () => {
  it("deriva sentido entrada para quantidade positiva", () => {
    const m = mapMovimentoRow({
      id: 1, produto_id: [12, "X"], local_id: [3, "A"],
      data: "2026-03-04 10:00:00", quantidade: 5,
    });
    expect(m.sentido).toBe("entrada");
    expect(m.mes).toBe("2026-03");
    expect(m.odooId).toBe(1);
  });
  it("deriva sentido saida para quantidade negativa", () => {
    const m = mapMovimentoRow({ id: 2, data: "2026-02-01", quantidade: -3 });
    expect(m.sentido).toBe("saida");
    expect(m.mes).toBe("2026-02");
  });
  it("carrega localInversoId e origem crus", () => {
    const m = mapMovimentoRow({
      id: 3, data: "2026-01-01", quantidade: 1,
      local_inverso_id: [5, "Inv"], origem: "NF-123",
    });
    expect(m.localInversoId).toBe(5);
    expect(m.origem).toBe("NF-123");
  });
});
