// Corte TECNICO da ingestao (T2a) , fixo, independente da data de inicio das analises.
import { describe, it, expect } from "@jest/globals";
import { corteDomain, corteDomainHerdado, CORTE_INGESTAO_ISO } from "./corte";

describe("corteDomain", () => {
  it("o corte da ingestao e FIXO em 2026-01-01 (nao e a data da tela)", () => {
    expect(CORTE_INGESTAO_ISO).toBe("2026-01-01");
  });

  it("nao depende da data de inicio das analises (mover a tela nao muda a ingestao)", async () => {
    const { corteAtual } = await import("../../lib/corte-dados");
    // A data da tela (padrao 16/03) nao pode vazar para o dominio do Odoo: se vazasse, o
    // worker pararia de puxar janeiro a marco e a reconciliacao apagaria o historico.
    expect(corteDomain("sped.documento")[0][2]).not.toBe(corteAtual());
    expect(corteDomain("sped.documento")).toEqual([["data_emissao", ">=", "2026-01-01"]]);
  });

  it("modelo transacional com corte gera clausula >= 2026-01-01", () => {
    expect(corteDomain("sped.documento")).toEqual([["data_emissao", ">=", CORTE_INGESTAO_ISO]]);
  });
  it("mestre sem corte gera clausula vazia", () => {
    expect(corteDomain("res.partner")).toEqual([]);
  });
  it("titulo (corteEspecial) NAO recebe clausula de data (divida viva entra sempre)", () => {
    expect(corteDomain("finan.lancamento")).toEqual([]);
  });
  it("modelo desconhecido gera vazia", () => {
    expect(corteDomain("nao.existe")).toEqual([]);
  });
});

describe("corteDomainHerdado , o corte que o filho herda do pai", () => {
  it("modelo com data propria: usa o campo dele", () => {
    expect(corteDomainHerdado("sped.documento")).toEqual([["data_emissao", ">=", "2026-01-01"]]);
  });

  // Sem isto, o reconcile perguntaria ao Odoo "quais itens existem?" e receberia os 233.563
  // do modelo inteiro (contra 59.804 dentro do corte), despejando ~172 mil linhas pre-corte
  // no cache. Medido no Odoo de producao em 2026-07-13.
  it("FILHO sem data propria: herda a data do pai por dot-notation", () => {
    expect(corteDomainHerdado("sped.documento.item")).toEqual([
      ["documento_id.data_emissao", ">=", "2026-01-01"],
    ]);
  });

  it("NETO: encadeia ate o avo", () => {
    expect(corteDomainHerdado("sped.documento.item.rastreabilidade")).toEqual([
      ["item_id.documento_id.data_emissao", ">=", "2026-01-01"],
    ]);
  });

  it("modelo mestre (sem corte nenhum): dominio vazio", () => {
    expect(corteDomainHerdado("sped.participante")).toEqual([]);
  });
});
