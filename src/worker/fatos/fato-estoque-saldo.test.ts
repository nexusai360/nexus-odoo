import { mapSaldoRow, buildProdutoClassMap, rebuildFatoEstoqueSaldo } from "./fato-estoque-saldo";

jest.mock("./fato-build-state", () => ({ markFatoBuilt: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { markFatoBuilt } = require("./fato-build-state");

describe("mapSaldoRow", () => {
  it("extrai os campos do registro raw do Odoo", () => {
    const raw = {
      id: 99,
      produto_id: [12, "Esteira X"],
      local_id: [3, "Galpão A"],
      saldo: 7,
      unidade_id: [1, "UN"],
    };
    expect(mapSaldoRow(raw, new Map())).toEqual({
      odooSaldoId: 99,
      produtoId: 12,
      produtoNome: "Esteira X",
      localId: 3,
      localNome: "Galpão A",
      quantidade: 7,
      unidade: "UN",
      vrSaldo: 0,
      familiaId: null,
      familiaNome: null,
      marcaId: null,
      marcaNome: null,
    });
  });

  it("tolera campos relacionais ausentes (false)", () => {
    const raw = { id: 1, produto_id: false, local_id: false, saldo: 0, unidade_id: false };
    const m = mapSaldoRow(raw, new Map());
    expect(m.produtoId).toBeNull();
    expect(m.produtoNome).toBeNull();
    expect(m.quantidade).toBe(0);
    expect(m.vrSaldo).toBe(0);
    expect(m.familiaId).toBeNull();
    expect(m.familiaNome).toBeNull();
    expect(m.marcaId).toBeNull();
    expect(m.marcaNome).toBeNull();
  });
});

describe("mapSaldoRow enriquecido", () => {
  const classMap = new Map([
    [12, { familiaId: 2, familiaNome: "Esteiras", marcaId: 5, marcaNome: "Matrix" }],
  ]);
  it("carrega vrSaldo, família e marca do produto", () => {
    const raw = {
      id: 99, produto_id: [12, "Esteira X"], local_id: [3, "Galpão A"],
      saldo: 7, unidade_id: [1, "UN"], vr_saldo: 1500.5,
    };
    const m = mapSaldoRow(raw, classMap);
    expect(m.vrSaldo).toBe(1500.5);
    expect(m.familiaId).toBe(2);
    expect(m.familiaNome).toBe("Esteiras");
    expect(m.marcaId).toBe(5);
    expect(m.marcaNome).toBe("Matrix");
  });
  it("carrega vrSaldo zero", () => {
    const raw = { id: 1, produto_id: [12, "X"], saldo: 0, vr_saldo: 0 };
    expect(mapSaldoRow(raw, classMap).vrSaldo).toBe(0);
  });
  it("produto ausente do mapa -> família/marca null", () => {
    const raw = { id: 2, produto_id: [999, "Y"], saldo: 1, vr_saldo: 10 };
    const m = mapSaldoRow(raw, classMap);
    expect(m.familiaId).toBeNull();
    expect(m.marcaId).toBeNull();
  });
  it("vr_saldo ausente vira 0", () => {
    const raw = { id: 3, produto_id: false, saldo: 1 };
    expect(mapSaldoRow(raw, classMap).vrSaldo).toBe(0);
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

describe("rebuildFatoEstoqueSaldo", () => {
  it("reconstrói o fato e marca o build", async () => {
    const tx = {
      fatoEstoqueSaldo: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      rawSpedProduto: { findMany: jest.fn().mockResolvedValue([]) },
      rawEstoqueSaldoHoje: {
        findMany: jest.fn().mockResolvedValue([
          { data: { id: 1, produto_id: [12, "X"], saldo: 5, vr_saldo: 100 } },
        ]),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as never;
    const n = await rebuildFatoEstoqueSaldo(prisma);
    expect(n).toBe(1);
    expect(tx.fatoEstoqueSaldo.createMany).toHaveBeenCalled();
    // markFatoBuilt agora roda dentro da transação, com o cliente tx (CR-01).
    expect(markFatoBuilt).toHaveBeenCalledWith(tx, "fato_estoque_saldo");
  });
});
