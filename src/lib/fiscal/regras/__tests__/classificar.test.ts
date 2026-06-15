// src/lib/fiscal/regras/__tests__/classificar.test.ts
import { classificarCfop } from "../classificar";

describe("classificarCfop , mapa curado", () => {
  it("venda: 5102 e 6108 sao receita", () => {
    expect(classificarCfop("5102")).toMatchObject({ categoria: "venda", ehReceita: true });
    expect(classificarCfop("6108")).toMatchObject({ categoria: "venda", ehReceita: true });
  });
  it("exportacao: 7101 e receita", () => {
    expect(classificarCfop("7101")).toMatchObject({ categoria: "exportacao", ehReceita: true });
  });
});

describe("classificarCfop , regressoes fiscais (review)", () => {
  it("(i) 6152 e TRANSFERENCIA, nao venda, e nao e receita", () => {
    const r = classificarCfop("6152");
    expect(r.categoria).toBe("transferencia");
    expect(r.ehReceita).toBe(false);
  });
  it("(ii) entrega futura nao dobra: 5922 simples_faturamento nao-receita; 5117 venda receita", () => {
    expect(classificarCfop("5922")).toMatchObject({ categoria: "simples_faturamento", ehReceita: false });
    expect(classificarCfop("5117")).toMatchObject({ categoria: "venda", ehReceita: true });
  });
  it("(iii) 6202 e DEVOLUCAO DE COMPRA, nao e receita e NAO deduz na F1", () => {
    const r = classificarCfop("6202");
    expect(r.categoria).toBe("devolucao_compra");
    expect(r.ehReceita).toBe(false);
    expect(r.deduzReceita).toBe(false);
  });
  it("(iv) 5933/6933 sao SERVICO (nao remessa)", () => {
    expect(classificarCfop("5933")).toMatchObject({ categoria: "servico" });
    expect(classificarCfop("6933")).toMatchObject({ categoria: "servico" });
  });
  it("venda de ativo 5551/6551 fora do faturamento de mercadoria", () => {
    expect(classificarCfop("5551")).toMatchObject({ categoria: "venda_ativo", ehReceita: false });
  });
  it("(v) 6932 e SERVICO de transporte (nao remessa), e receita", () => {
    expect(classificarCfop("6932")).toMatchObject({ categoria: "servico", ehReceita: true });
    expect(classificarCfop("5932")).toMatchObject({ categoria: "servico", ehReceita: true });
  });
  it("(vi) 5949/6949 'outra saida' caem em OUTRAS (nao remessa), nao-receita", () => {
    expect(classificarCfop("6949")).toMatchObject({ categoria: "outras", ehReceita: false });
    expect(classificarCfop("5949")).toMatchObject({ categoria: "outras", ehReceita: false });
  });
  it("(vii) 6918 devolucao de consignacao nao vira remessa", () => {
    expect(classificarCfop("6918")).toMatchObject({ categoria: "devolucao_compra", ehReceita: false });
  });
});

describe("classificarCfop , prefixo e fallback", () => {
  it("remessa nao curada cai no prefixo (5908 -> remessa, nao receita)", () => {
    expect(classificarCfop("5908")).toMatchObject({ categoria: "remessa", ehReceita: false });
  });
  it("entrada anomala: 1352 como saida -> entrada_anomala", () => {
    expect(classificarCfop("1352")).toMatchObject({ categoria: "entrada_anomala", ehReceita: false });
  });
  it("desconhecido cai no fallback conservador (outras, nao-receita)", () => {
    expect(classificarCfop("5999")).toMatchObject({ categoria: "outras", ehReceita: false });
  });
  it("null/sem cfop -> sem_cfop, nao-receita", () => {
    expect(classificarCfop(null)).toMatchObject({ categoria: "sem_cfop", ehReceita: false });
  });
});
