jest.mock("./fato-build-state", () => ({ markFatoBuilt: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { markFatoBuilt } = require("./fato-build-state");
import {
  mapMovimentoRow, temEfeito, rebuildFatoEstoqueMovimento,
  type FatoMovimentoRow,
} from "./fato-estoque-movimento";

/** Helper: mapeia e garante linha não-nula (data válida). */
function mapNonNull(raw: Record<string, unknown>): FatoMovimentoRow {
  const m = mapMovimentoRow(raw);
  if (!m) throw new Error("esperava linha não-nula");
  return m;
}

describe("mapMovimentoRow", () => {
  it("deriva sentido entrada para quantidade positiva", () => {
    const m = mapNonNull({
      id: 1, produto_id: [12, "X"], local_id: [3, "A"],
      data: "2026-03-04 10:00:00", quantidade: 5,
    });
    expect(m.sentido).toBe("entrada");
    expect(m.mes).toBe("2026-03");
    expect(m.odooId).toBe(1);
  });
  it("deriva sentido saida para quantidade negativa", () => {
    const m = mapNonNull({ id: 2, data: "2026-02-01", quantidade: -3 });
    expect(m.sentido).toBe("saida");
    expect(m.mes).toBe("2026-02");
  });
  it("deriva sentido neutro para quantidade zero (IM-01)", () => {
    const m = mapNonNull({ id: 9, data: "2026-02-01", quantidade: 0 });
    expect(m.sentido).toBe("neutro");
  });
  it("carrega localInversoId e origem crus", () => {
    const m = mapNonNull({
      id: 3, data: "2026-01-01", quantidade: 1,
      local_inverso_id: [5, "Inv"], origem: "NF-123",
    });
    expect(m.localInversoId).toBe(5);
    expect(m.origem).toBe("NF-123");
  });
  it("retorna null quando a data é inválida (IM-02)", () => {
    expect(mapMovimentoRow({ id: 4, data: false, quantidade: 5 })).toBeNull();
    expect(mapMovimentoRow({ id: 5, data: "lixo", quantidade: 5 })).toBeNull();
    expect(mapMovimentoRow({ id: 6, quantidade: 5 })).toBeNull();
  });
});

describe("temEfeito", () => {
  it("descarta movimento de quantidade zero", () => {
    expect(temEfeito(mapNonNull({ id: 1, data: "2026-01-01", quantidade: 0 }))).toBe(false);
  });
  it("mantém movimento de quantidade negativa", () => {
    expect(temEfeito(mapNonNull({ id: 2, data: "2026-01-01", quantidade: -3 }))).toBe(true);
  });
  it("mantém movimento de quantidade positiva", () => {
    expect(temEfeito(mapNonNull({ id: 3, data: "2026-01-01", quantidade: 4 }))).toBe(true);
  });
});

describe("rebuildFatoEstoqueMovimento", () => {
  it("descarta quantidade zero, reconstrói e marca o build", async () => {
    const tx = {
      fatoEstoqueMovimento: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      rawEstoqueExtrato: {
        findMany: jest.fn().mockResolvedValue([
          { data: { id: 1, data: "2026-01-01", quantidade: 5 } },
          { data: { id: 2, data: "2026-01-01", quantidade: 0 } },
          { data: { id: 3, data: false, quantidade: 9 } },
        ]),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as never;
    const n = await rebuildFatoEstoqueMovimento(prisma);
    expect(n).toBe(1); // quantidade 0 e data inválida descartadas
    expect(tx.fatoEstoqueMovimento.createMany).toHaveBeenCalled();
    // markFatoBuilt agora roda dentro da transação, com o cliente tx (CR-01).
    expect(markFatoBuilt).toHaveBeenCalledWith(tx, "fato_estoque_movimento");
  });
});
