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

// VENDA FUTURA (decisao do dono, 2026-07-13, confirmando a da Mariane em 08/07):
// a receita da venda futura so entra no faturamento quando vira REMESSA (x117). A nota de
// simples faturamento (5922/6922) cobra o cliente antes, mas NAO conta no mes em que sai.
// Nenhum dos dois nomes de operacao tem a palavra "venda", entao ate aqui a receita da venda
// futura sumia das DUAS pontas: R$ 538 mil desde 16/03/2026, R$ 3.500 so em julho.
describe("venda futura , a receita e a remessa (x117), nunca o simples faturamento (5922)", () => {
  const REMESSA_X117 = "Remessa de Mercadoria Originada de Encomenda 5117/6117 - Presumido";
  const SIMPLES_FAT = "Simples Faturamento para Entrega Futura 5922/6922 - Lucro Presumido";

  it("remessa de entrega futura (5117/6117) => e faturamento", () => {
    expect(ehOperacaoVenda({ operacaoNome: REMESSA_X117, finalidadeNfe: "1" })).toBe(true);
    expect(notaEhVendaExterna({ ...vendaOk, operacaoNome: REMESSA_X117 })).toBe(true);
  });
  it("simples faturamento de entrega futura (5922/6922) => NAO e faturamento", () => {
    expect(ehOperacaoVenda({ operacaoNome: SIMPLES_FAT, finalidadeNfe: "1" })).toBe(false);
    expect(notaEhVendaExterna({ ...vendaOk, operacaoNome: SIMPLES_FAT })).toBe(false);
  });
  it("remessa x117 segue presa as demais travas (intragrupo, devolucao, situacao)", () => {
    expect(notaEhVendaExterna({ ...vendaOk, operacaoNome: REMESSA_X117, intragrupo: true })).toBe(false);
    expect(notaEhVendaExterna({ ...vendaOk, operacaoNome: REMESSA_X117, finalidadeNfe: "4" })).toBe(false);
    expect(notaEhVendaExterna({ ...vendaOk, operacaoNome: REMESSA_X117, situacaoNfe: "cancelada" })).toBe(false);
  });
  it("'Lancamento 1922/2922' (a entrada, contrapartida) nao vira faturamento por conter '922'", () => {
    expect(ehOperacaoVenda({ operacaoNome: "Lançamento 1922/2922", finalidadeNfe: "1" })).toBe(false);
  });
  it("outras remessas (demonstracao 5912, garantia 5949) seguem fora", () => {
    expect(ehOperacaoVenda({
      operacaoNome: "Remessa de Mercadoria ou bem Para Demonstração 5912/6912 - Real",
      finalidadeNfe: "1",
    })).toBe(false);
    expect(ehOperacaoVenda({ operacaoNome: "5949/6949 - Remessa em garantia LP", finalidadeNfe: "1" })).toBe(false);
  });
});
