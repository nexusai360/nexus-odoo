// src/lib/fiscal/regras/__tests__/nota-venda-externa.test.ts
import { notaEhVendaExterna, ehOperacaoVenda } from "../nota-venda-externa";

const vendaOk = {
  entradaSaida: "1",
  situacaoNfe: "autorizada",
  modelo: "55",
  operacaoNome: "AOP1 - Venda LR",
  finalidadeNfe: "1",
  intragrupo: false,
};

describe("ehOperacaoVenda , a operacao fiscal e o criterio de venda", () => {
  it("venda de verdade => true", () => {
    expect(ehOperacaoVenda({ operacaoNome: "AOP1 - Venda SN", finalidadeNfe: "1" })).toBe(true);
  });
  it("venda INTERNA (entre empresas do grupo) => false", () => {
    expect(ehOperacaoVenda({ operacaoNome: "AOP1 - Venda interna LR", finalidadeNfe: "1" })).toBe(false);
    expect(ehOperacaoVenda({ operacaoNome: "AOP5 - VENDA INTERNA SN", finalidadeNfe: "1" })).toBe(false);
  });
  it("devolucao (finalidade 4) => false, mesmo com operacao de venda", () => {
    expect(ehOperacaoVenda({ operacaoNome: "AOP1 - Venda LR", finalidadeNfe: "4" })).toBe(false);
  });
  it("operacao que nao e venda (remessa, transferencia) => false", () => {
    expect(ehOperacaoVenda({ operacaoNome: "AOP2 - Remessa", finalidadeNfe: "1" })).toBe(false);
  });
  it("nota sem operacao no cache => false (nunca inventa faturamento)", () => {
    expect(ehOperacaoVenda({ operacaoNome: null, finalidadeNfe: "1" })).toBe(false);
  });
});

describe("notaEhVendaExterna , regra canonica de venda a cliente externo", () => {
  it("saida autorizada mod 55 com operacao de venda, externa => true", () => {
    expect(notaEhVendaExterna(vendaOk)).toBe(true);
  });
  it("entrada (devolucao/compra) => false", () => {
    expect(notaEhVendaExterna({ ...vendaOk, entradaSaida: "0" })).toBe(false);
  });
  it("nao autorizada (em_digitacao) => false", () => {
    expect(notaEhVendaExterna({ ...vendaOk, situacaoNfe: "em_digitacao" })).toBe(false);
  });
  it("modelo 65 (NFC-e, venda a consumidor) => true", () => {
    expect(notaEhVendaExterna({ ...vendaOk, modelo: "65" })).toBe(true);
  });
  it("modelo 57 (CT-e) => false", () => {
    expect(notaEhVendaExterna({ ...vendaOk, modelo: "57" })).toBe(false);
  });
  it("venda interna (operacao) => false", () => {
    expect(notaEhVendaExterna({ ...vendaOk, operacaoNome: "AOP1 - Venda interna LR" })).toBe(false);
  });
  it("operacao nao-venda (transferencia) => false", () => {
    expect(notaEhVendaExterna({ ...vendaOk, operacaoNome: "AOP3 - Transferencia" })).toBe(false);
  });
  it("devolucao de venda (finalidade 4) => false", () => {
    expect(notaEhVendaExterna({ ...vendaOk, finalidadeNfe: "4" })).toBe(false);
  });
  it("intragrupo (triangulacao) => false", () => {
    expect(notaEhVendaExterna({ ...vendaOk, intragrupo: true })).toBe(false);
  });
  it("venda sem item no cache (sem CFOP) continua sendo venda , a operacao manda", () => {
    // O CFOP saiu da condicao justamente por isso: em julho/2026 uma venda de R$ 3.220,00
    // nao tinha item no cache e era descartada, furando o total do dono.
    expect(notaEhVendaExterna({ ...vendaOk })).toBe(true);
  });
});
