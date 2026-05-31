import {
  mapContabilLancamentoItemRow,
  type ItemDenormMaps,
} from "./fato-contabil-lancamento-item";

const maps: ItemDenormMaps = {
  contaPorId: new Map([[55, { natureza: "04", codigo: "3.01.01" }]]),
  tipoPorLancamento: new Map([[100, "N"], [200, "E"]]),
};

describe("mapContabilLancamentoItemRow", () => {
  it("denormaliza contaNatureza/contaCodigo (do plano) e lancamentoTipo (do cabeçalho)", () => {
    const raw = {
      id: 1,
      lancamento_id: [100, "LC-0001"],
      conta_id: [55, "RECEITA DE VENDAS"],
      centro_custo_id: [9, "Comercial"],
      natureza: "C",
      valor: 1000,
      valor_credito: 1000,
      valor_debito: 0,
      data_lancamento: "2026-05-10",
      historico_completo: "Venda de mercadoria",
    };
    const row = mapContabilLancamentoItemRow(raw, maps);
    expect(row.odooId).toBe(1);
    expect(row.lancamentoId).toBe(100);
    expect(row.lancamentoTipo).toBe("N"); // do cabeçalho
    expect(row.contaId).toBe(55);
    expect(row.contaCodigo).toBe("3.01.01"); // do plano de contas
    expect(row.contaNatureza).toBe("04"); // Resultado
    expect(row.contaNome).toBe("RECEITA DE VENDAS");
    expect(row.centroCustoNome).toBe("Comercial");
    expect(row.natureza).toBe("C");
    expect(row.valorCredito).toBe(1000);
  });

  it("lancamentoTipo='E' (Encerramento) é capturado para exclusão na DRE", () => {
    const raw = { id: 2, lancamento_id: [200, "ENC"], conta_id: [55, "X"], natureza: "D", valor_debito: 500 };
    const row = mapContabilLancamentoItemRow(raw as Record<string, unknown>, maps);
    expect(row.lancamentoTipo).toBe("E");
    expect(row.valorDebito).toBe(500);
  });

  it("trata conta/lançamento ausentes no mapa e relacionais vazios", () => {
    const raw = { id: 3, lancamento_id: false, conta_id: false, centro_custo_id: false, valor: false };
    const row = mapContabilLancamentoItemRow(raw as Record<string, unknown>, maps);
    expect(row.lancamentoId).toBeNull();
    expect(row.lancamentoTipo).toBeNull();
    expect(row.contaId).toBeNull();
    expect(row.contaNatureza).toBeNull();
    expect(row.contaCodigo).toBeNull();
    expect(row.valor).toBe(0);
  });
});
