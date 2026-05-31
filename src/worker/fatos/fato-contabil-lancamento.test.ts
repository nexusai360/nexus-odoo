import { mapContabilLancamentoRow } from "./fato-contabil-lancamento";

describe("mapContabilLancamentoRow", () => {
  it("mapeia o cabeçalho do lançamento", () => {
    const raw = {
      id: 100,
      codigo: "LC-0001",
      tipo: "N",
      data_lancamento: "2026-05-01",
      valor: 250.75,
      valor_debito: 250.75,
      valor_credito: 250.75,
      empresa_id: [1, "Matrix"],
    };
    const row = mapContabilLancamentoRow(raw);
    expect(row.odooId).toBe(100);
    expect(row.codigo).toBe("LC-0001");
    expect(row.tipo).toBe("N");
    expect(row.dataLancamento).toEqual(new Date("2026-05-01"));
    expect(row.valor).toBe(250.75);
    expect(row.empresaId).toBe(1);
  });

  it("trata monetários e relacionais vazios (false)", () => {
    const raw = { id: 2, valor: false, valor_debito: false, valor_credito: false, empresa_id: false };
    const row = mapContabilLancamentoRow(raw as Record<string, unknown>);
    expect(row.valor).toBe(0);
    expect(row.valorDebito).toBe(0);
    expect(row.valorCredito).toBe(0);
    expect(row.empresaId).toBeNull();
    expect(row.tipo).toBeNull();
  });
});
