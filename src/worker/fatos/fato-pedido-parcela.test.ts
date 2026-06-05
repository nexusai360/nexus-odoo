// src/worker/fatos/fato-pedido-parcela.test.ts
import { mapPedidoParcelaRow } from "./fato-pedido-parcela";

const rawBase: Record<string, unknown> = {
  id: 101,
  pedido_id: [42, "PED-0042"],
  numero: "1/1",
  participante_id: [100, "Cliente X"],
  data_vencimento: "2024-03-01",
  valor: "500.00",
  valor_readonly: "500.00",
  vr_juros: "10.00",
  vr_multa: "5.00",
  vr_desconto: "2.00",
  vr_documento: "513.00",
  forma_pagamento_id: [1, "Boleto"],
  parcela_faturada: true,
  finan_lancamento_id: [200, "Lanç 200"],
};

describe("mapPedidoParcelaRow", () => {
  it("mapeia odooId e pedidoId", () => {
    const result = mapPedidoParcelaRow(rawBase);
    expect(result.odooId).toBe(101);
    expect(result.pedidoId).toBe(42);
  });

  it("mapeia numero", () => {
    const result = mapPedidoParcelaRow(rawBase);
    expect(result.numero).toBe("1/1");
  });

  it("mapeia participante via m2o", () => {
    const result = mapPedidoParcelaRow(rawBase);
    expect(result.participanteId).toBe(100);
    expect(result.participanteNome).toBe("Cliente X");
  });

  it("parseia dataVencimento com T00:00:00", () => {
    const result = mapPedidoParcelaRow(rawBase);
    expect(result.dataVencimento).toEqual(new Date("2024-03-01T00:00:00Z"));
  });

  it("dataVencimento null quando não é string", () => {
    const raw = { ...rawBase, data_vencimento: false };
    const result = mapPedidoParcelaRow(raw as Record<string, unknown>);
    expect(result.dataVencimento).toBeNull();
  });

  it("usa valor como número", () => {
    const result = mapPedidoParcelaRow(rawBase);
    expect(result.valor).toBe(500);
  });

  it("usa valor_readonly como fallback quando valor ausente", () => {
    const raw = { ...rawBase, valor: undefined };
    const result = mapPedidoParcelaRow(raw as Record<string, unknown>);
    expect(result.valor).toBe(500);
  });

  it("valor 0 quando ambos ausentes", () => {
    const raw = { ...rawBase, valor: undefined, valor_readonly: undefined };
    const result = mapPedidoParcelaRow(raw as Record<string, unknown>);
    expect(result.valor).toBe(0);
  });

  it("mapeia campos monetários adicionais", () => {
    const result = mapPedidoParcelaRow(rawBase);
    expect(result.vrJuros).toBe(10);
    expect(result.vrMulta).toBe(5);
    expect(result.vrDesconto).toBe(2);
    expect(result.vrDocumento).toBe(513);
  });

  it("mapeia formaPagamentoNome via m2o", () => {
    const result = mapPedidoParcelaRow(rawBase);
    expect(result.formaPagamentoNome).toBe("Boleto");
  });

  it("mapeia parcelaFaturada como boolean", () => {
    const result = mapPedidoParcelaRow(rawBase);
    expect(result.parcelaFaturada).toBe(true);
  });

  it("parcelaFaturada false quando campo é false/undefined", () => {
    const raw = { ...rawBase, parcela_faturada: false };
    const result = mapPedidoParcelaRow(raw as Record<string, unknown>);
    expect(result.parcelaFaturada).toBe(false);
  });

  it("mapeia finanLancamentoId via m2o", () => {
    const result = mapPedidoParcelaRow(rawBase);
    expect(result.finanLancamentoId).toBe(200);
  });

  it("não produz campo atualizadoEm", () => {
    const result = mapPedidoParcelaRow(rawBase);
    expect("atualizadoEm" in result).toBe(false);
  });
});
