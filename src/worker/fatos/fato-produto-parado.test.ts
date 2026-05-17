import { buildSaldoHojeMap, mapProdutoParadoRow, rebuildFatoProdutoParado } from "./fato-produto-parado";

jest.mock("./fato-build-state", () => ({ markFatoBuilt: jest.fn() }));
const { markFatoBuilt } = require("./fato-build-state");

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

describe("rebuildFatoProdutoParado", () => {
  it("filtra saldo > 0, reconstrói e marca o build", async () => {
    const tx = {
      fatoProdutoParado: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      rawEstoqueSaldoHoje: {
        findMany: jest.fn().mockResolvedValue([
          { data: { id: 100, produto_id: [12, "X"], saldo: 8, vr_saldo: 500 } },
          { data: { id: 101, produto_id: [13, "Y"], saldo: 0, vr_saldo: 0 } },
        ]),
      },
      rawEstoqueSaldoHojeDuracaoDias: {
        findMany: jest.fn().mockResolvedValue([
          { data: { saldo_hoje_id: [100, "?"], dias: 50 } },
          { data: { saldo_hoje_id: [101, "?"], dias: 90 } },
        ]),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as never;
    const n = await rebuildFatoProdutoParado(prisma);
    expect(n).toBe(1); // a linha com saldo 0 foi filtrada
    expect(markFatoBuilt).toHaveBeenCalledWith(prisma, "fato_produto_parado");
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
