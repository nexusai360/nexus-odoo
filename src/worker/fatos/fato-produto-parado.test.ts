import { buildSaldoHojeMap } from "./fato-produto-parado";

describe("buildSaldoHojeMap", () => {
  it("monta o mapa por id da linha de saldo", () => {
    const rows = [
      { data: {
        id: 100, produto_id: [12, "X"], local_id: [3, "A"],
        saldo: 8, vr_saldo: 500, unidade_id: [1, "UN"],
      } },
    ];
    const map = buildSaldoHojeMap(rows);
    expect(map.get(100)).toEqual({
      produtoId: 12, produtoNome: "X", localId: 3, localNome: "A",
      saldo: 8, vrSaldo: 500, unidade: "UN",
    });
  });
  it("retorna mapa vazio sem linhas", () => {
    expect(buildSaldoHojeMap([]).size).toBe(0);
  });
});
