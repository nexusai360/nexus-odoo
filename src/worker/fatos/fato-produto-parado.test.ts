import { buildSaldoHojeMap, mapProdutoParadoRow } from "./fato-produto-parado";

const saldoMap = new Map([
  [100, { produtoId: 12, produtoNome: "X", localId: 3, localNome: "A",
          saldo: 8, vrSaldo: 500, unidade: "UN" }],
]);

describe("mapProdutoParadoRow", () => {
  it("faz o join por saldo_hoje_id[0] e grava dias cru", () => {
    const row = mapProdutoParadoRow(
      { data: { saldo_hoje_id: [100, "Saldo X"], dias: 179 } },
      saldoMap,
    );
    expect(row).toEqual({
      saldoHojeId: 100, produtoId: 12, produtoNome: "X",
      localId: 3, localNome: "A", saldo: 8, dias: 179,
      vrSaldo: 500, unidade: "UN",
    });
  });
  it("retorna null quando o join não encontra a linha de saldo", () => {
    expect(
      mapProdutoParadoRow({ data: { saldo_hoje_id: [999, "?"], dias: 10 } }, saldoMap),
    ).toBeNull();
  });
});

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
