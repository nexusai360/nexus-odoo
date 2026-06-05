import { mapLancamentoItemRow, rebuildFatoFinanceiroLancamentoItem } from "./fato-financeiro-lancamento-item";

const itemRaw: Record<string, unknown> = {
  id: 500,
  lancamento_id: [10, "LAN-10"],
  conta_id: [3, "Aluguel"],
  centro_resultado_id: [2, "Matriz"],
  descricao: "Aluguel maio",
  pedido_id: false,
  vr_documento: "1000.00",
  vr_total: "1000.00",
  vr_saldo: "0.00",
  vr_pago_total: "1000.00",
};

describe("mapLancamentoItemRow", () => {
  it("mapeia campos e herda tipo/data do lancamento pai", () => {
    const r = mapLancamentoItemRow(itemRaw, { tipo: "a_pagar", dataDocumento: new Date("2026-05-10T00:00:00Z") });
    expect(r.odooId).toBe(500);
    expect(r.lancamentoId).toBe(10);
    expect(r.tipo).toBe("a_pagar");
    expect(r.contaId).toBe(3);
    expect(r.contaNome).toBe("Aluguel");
    expect(r.centroResultadoId).toBe(2);
    expect(r.descricao).toBe("Aluguel maio");
    expect(r.vrTotal).toBe(1000);
    expect(r.dataDocumento).toEqual(new Date("2026-05-10T00:00:00Z"));
  });
  it("sem pai conhecido: tipo vazio e data null", () => {
    const r = mapLancamentoItemRow(itemRaw, undefined);
    expect(r.tipo).toBe("");
    expect(r.dataDocumento).toBeNull();
  });
});

describe("rebuildFatoFinanceiroLancamentoItem", () => {
  it("monta mapa do pai e popula itens com tipo herdado", async () => {
    const mockTx = {
      fatoFinanceiroLancamentoItem: { deleteMany: jest.fn().mockResolvedValue({}), createMany: jest.fn().mockResolvedValue({}) },
      fatoBuildState: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const mockPrisma = {
      rawFinanLancamento: { findMany: jest.fn().mockResolvedValue([{ data: { id: 10, tipo: "a_pagar", data_documento: "2026-05-10" } }]) },
      rawFinanLancamentoItem: { findMany: jest.fn().mockResolvedValue([{ data: itemRaw }]) },
      $transaction: jest.fn().mockImplementation(async (fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
    } as unknown as Parameters<typeof rebuildFatoFinanceiroLancamentoItem>[0];
    const count = await rebuildFatoFinanceiroLancamentoItem(mockPrisma);
    expect(count).toBe(1);
    expect(mockTx.fatoFinanceiroLancamentoItem.createMany).toHaveBeenCalledTimes(1);
    const arg = (mockTx.fatoFinanceiroLancamentoItem.createMany as jest.Mock).mock.calls[0][0];
    expect(arg.data[0].tipo).toBe("a_pagar");
    expect(mockTx.fatoBuildState.upsert).toHaveBeenCalled();
  });
});
