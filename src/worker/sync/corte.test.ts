// Corte TECNICO da ingestao (T2a) , fixo, independente da data de inicio das analises.
import { describe, it, expect } from "@jest/globals";
import {
  corteDomain,
  corteDomainHerdado,
  corteIngestaoDe,
  OVERRIDE_INGESTAO,
  CORTE_INGESTAO_ISO,
} from "./corte";

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

describe("OVERRIDE_INGESTAO , recuo cirurgico por-modelo (fonte unica, Fase 1B)", () => {
  // TRAVA DE ROLLBACK (review ALTO): este snapshot do conteudo do override existe para que
  // remover/reverter o override QUEBRE o teste. Motivo: os pedidos antigos (2024-11..2025) so
  // sobrevivem ao reconcile diario enquanto este literal estiver deployado. Um rollback de
  // imagem/revert para uma versao sem o override faria vivos(pedido)=data_orcamento>=2026 e o
  // proximo reconcile marcaria TODO pedido pre-2026 como rawDeleted (PR#168). Ver runbook.
  it("contem EXATAMENTE pedido.documento e sped.documento.item recuados para 2024-11-01", () => {
    expect([...OVERRIDE_INGESTAO.entries()].sort()).toEqual([
      ["pedido.documento", "2024-11-01"],
      ["sped.documento.item", "2024-11-01"],
    ]);
    expect(OVERRIDE_INGESTAO.size).toBe(2);
  });

  it("corteIngestaoDe devolve o override quando existe, senao o global", () => {
    expect(corteIngestaoDe("pedido.documento")).toBe("2024-11-01");
    expect(corteIngestaoDe("sped.documento.item")).toBe("2024-11-01");
    expect(corteIngestaoDe("sped.documento")).toBe(CORTE_INGESTAO_ISO);
    expect(corteIngestaoDe("res.partner")).toBe(CORTE_INGESTAO_ISO);
  });

  it("pedido.documento usa o override no corteDomain (recuo cirurgico), nao o global", () => {
    expect(corteDomain("pedido.documento")).toEqual([["data_orcamento", ">=", "2024-11-01"]]);
  });

  it("modelo com corte proprio e sem override continua no global 2026", () => {
    expect(corteDomain("sped.documento")).toEqual([["data_emissao", ">=", CORTE_INGESTAO_ISO]]);
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
