// src/lib/fiscal/regras/__tests__/nota-devolucao-venda.test.ts
import {
  notaEhDevolucaoDeVenda,
  faturamentoLiquido,
} from "../nota-devolucao-venda";
import { classificarCfop } from "../classificar";

const base = {
  entradaSaida: "0",
  situacaoNfe: "autorizada",
  modelo: "55",
  categoria: "devolucao_venda" as const,
  intragrupo: false,
};

describe("notaEhDevolucaoDeVenda , entrada fin.4 CFOP 1202/2202 (nao saida)", () => {
  it("entrada autorizada mod 55 devolucao_venda externo => true", () => {
    expect(notaEhDevolucaoDeVenda(base)).toBe(true);
  });
  it("CFOP 1202 e 2202 sao devolucao_venda (ligacao com o nucleo)", () => {
    expect(classificarCfop("1202").categoria).toBe("devolucao_venda");
    expect(classificarCfop("2202").categoria).toBe("devolucao_venda");
  });
  it("SAIDA fin.4 (devolucao de COMPRA, CFOP 5202/6202) NAO e devolucao de venda", () => {
    expect(notaEhDevolucaoDeVenda({ ...base, entradaSaida: "1" })).toBe(false);
    expect(classificarCfop("6202").categoria).toBe("devolucao_compra");
  });
  it("categoria diferente de devolucao_venda => false", () => {
    expect(notaEhDevolucaoDeVenda({ ...base, categoria: "devolucao_compra" })).toBe(false);
  });
  it("intragrupo => false", () => {
    expect(notaEhDevolucaoDeVenda({ ...base, intragrupo: true })).toBe(false);
  });
});

describe("faturamentoLiquido", () => {
  it("liquido = bruto menos devolucoes", () => {
    expect(faturamentoLiquido(167_500_000, 1_776_463)).toBeCloseTo(165_723_537);
  });
});
